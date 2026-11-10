// More bedroom items (designs + preset variants of bedroom.js entries). See ARCHITECTURE.md §12 → Library objects.
// Beds share one bedding dresser (`dress`): duvet folded back with a turned-down band, a
// folded throw at the foot, pillows leaning on the headboard (or lying flat on floor beds).
import { THREE, Kit, item, P, OPT, variant, clamp, rng, T, shellGeo, pillowGeo, drapeGeo, addCabinet, addHandle, roundRect, ellipse, frameShape, transformAdded } from './helpers.js';
import { ITEMS as BASE, clothGeo } from './bedroom.js';
import { splayLegs, recentre } from './dining.js';

const baseOf = (id) => BASE.find((e) => e.id === id);

/* ------------------------------------------------------------ shared */

const SZ = { single: [1.0, 2.0], supersingle: [1.1, 2.0], queen: [1.5, 2.0], king: [1.6, 2.0], largeking: [1.8, 2.0], usqueen: [1.52, 2.03], usking: [1.93, 2.03] };
const SIZE_OPTS = [
  ['single', '싱글 1000×2000', 'Single 1000×2000'], ['supersingle', '슈퍼싱글 1100×2000', 'Super single 1100×2000'],
  ['queen', '퀸 1500×2000', 'Queen 1500×2000'], ['king', '킹 1600×2000', 'King 1600×2000'], ['largeking', '라지킹 1800×2000', 'Large king 1800×2000'],
  ['usqueen', '미국 퀸 1520×2030', 'US queen 1520×2030'], ['usking', '미국 킹 1930×2030', 'US king 1930×2030'],
];
const pSize = (def = 'queen') => P.pick('bedSize', '크기', 'Size', def, SIZE_OPTS);
const mattOf = (p) => SZ[p.bedSize] ?? SZ.queen;
const BEDDING = (fab = 'fabric-cotton-white', thr = 'fabric-wool-charcoal', n = 2, throwOn = true) => [
  P.bool('bedding', '침구', 'Bedding', true),
  P.mat('beddingFabric', '침구 천', 'Bedding fabric', fab, 'fabric'),
  P.bool('throw', '스로우 담요', 'Throw blanket', throwOn),
  P.mat('throwFabric', '담요 천', 'Throw fabric', thr, 'fabric'),
  P.int('pillows', '베개 수', 'Pillows', n, 0, 4),
];

/** Mattress (bottom at y, centred at x/z); returns its top. */
function mattress(k, mw, ml, y, z, h = 0.24, mat = 'fabric-linen-white', x = 0) {
  k.soft('mattress', mat, mw - 0.01, h, ml - 0.01, Math.min(0.05, h * 0.3), x, y + h / 2, z, { puff: 0.008 });
  return y + h;
}

/**
 * Bedding on a mattress whose top is mTop, head at zHead, foot at zFoot (head at −z).
 * drop = how far the duvet hangs over the sides (keep it above a wider frame's rail),
 * foot = whether it also hangs over the foot (false behind a high footboard),
 * lean = pillow tilt from horizontal (0.55 against a headboard, 0 on a floor bed).
 */
function dress(k, p, { mw, ml, mTop, zHead, zFoot, x = 0, drop = 0.2, foot = true, fold = 0.45, lean = 0.55, accent = true, pillowLen = 0.48, pillowW = 0.7, seed = 7 }) {
  drop = clamp(drop, 0.025, Math.max(0.025, Math.min(mTop - 0.02, (mTop + 0.025) / 1.12 - 0.006)));
  const r = Math.min(0.06, drop * 0.75);
  const dt = 0.045;
  if (p.bedding) {
    const covered = ml - fold;
    const zEnd = foot ? zFoot - 0.005 : zFoot - 0.03;
    const duvet = clothGeo({ w: mw, l: covered, top: mTop - 0.012, drop, r, thick: dt, nu: k.seg(44, 14), nv: k.seg(40, 12), sides: { left: true, right: true, foot }, seed: mw * seed });
    duvet.translate(x, 0, zEnd - covered / 2);
    k.add('bedding', p.beddingFabric, duvet);
    // turned-down top edge
    const bd = Math.max(0.025, drop - 0.03);
    const band = clothGeo({ w: mw + 0.02, l: 0.26, top: mTop - 0.012 + dt, drop: bd, r: Math.min(0.09, bd * 0.8), thick: 0.02, nu: k.seg(36, 10), nv: k.seg(6, 3), sides: { left: true, right: true, foot: false }, folds: 0.006, seed: 2 });
    band.translate(x, 0, zEnd - covered + 0.13);
    k.add('bedding', p.beddingFabric, band);
    if (p.throw) {
      const td = Math.min(drop + 0.03, mTop - 0.02);
      const tw = clothGeo({ w: mw, l: 0.45, top: mTop + dt + 0.002, drop: td, r: Math.min(0.08, td * 0.8), thick: 0.014, nu: k.seg(40, 12), nv: k.seg(10, 4), sides: { left: true, right: true, foot: false }, folds: 0.01, puffy: 0.004, seed: 5 });
      tw.translate(x, 0, zEnd - 0.32);
      k.add('throw', p.throwFabric, tw);
    }
  }
  const n = p.pillows;
  if (n > 0) {
    const pw = Math.min(pillowW, (mw - 0.08) / n);
    for (let i = 0; i < n; i++) {
      const g = pillowGeo(pw - 0.03, pillowLen, 0.16, k.seg(16, 6));
      T(g, 0, 0, 0, -Math.PI / 2 + lean, 0, lean > 0.2 ? (i - (n - 1) / 2) * 0.03 : 0);
      const y = mTop + Math.sin(lean) * pillowLen * 0.33 + 0.04 * Math.cos(lean);
      g.translate(x - mw / 2 + 0.04 + pw * (i + 0.5) + (mw - 0.08 - pw * n) / 2, y, zHead + 0.03 + Math.cos(lean) * pillowLen / 2);
      k.add('pillows', p.beddingFabric, g);
    }
    if (accent && lean > 0.3 && p.bedding && mw >= 1.3) {
      const g = pillowGeo(0.5, 0.32, 0.12, k.seg(14, 5));
      T(g, 0, 0, 0, -0.5, 0, 0);
      g.translate(x, mTop + 0.2, zHead + 0.43);
      k.add('cushion', p.throwFabric, g);
    }
  }
}

/** Rectangle whose two top corners are rounded with radius r (arched when r = w / 2). */
function topRound(w, h, r, y0 = 0) {
  r = Math.min(r, w / 2 - 0.0005, h - 0.001);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, y0); s.lineTo(w / 2, y0); s.lineTo(w / 2, y0 + h - r);
  s.quadraticCurveTo(w / 2, y0 + h, w / 2 - r, y0 + h);
  s.lineTo(-w / 2 + r, y0 + h); s.quadraticCurveTo(-w / 2, y0 + h, -w / 2, y0 + h - r);
  s.lineTo(-w / 2, y0);
  return s;
}
/** Shape with a hole (frames around mirrors / cane). */
function ringShape(outer, inner) {
  outer.holes.push(new THREE.Path(inner.getPoints(32).reverse()));
  return outer;
}
/** Piping cord around a rounded rectangle at height y (upholstered bases, mattresses). */
function piping(k, role, mat, w, l, r, y, z = 0, rad = 0.006, x = 0) {
  const pts = [];
  for (const v of roundRect(w, l, r).getPoints(6)) { const q = pts[pts.length - 1]; if (!q || Math.hypot(q[0] - x - v.x, q[2] - z - v.y) > 0.002) pts.push([x + v.x, y, z + v.y]); }
  pts.pop();
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), true, 'centripetal');
  k.tube(role, mat, null, rad, { curve, closed: true, segs: k.seg(160, 40), radial: k.seg(6, 3) });
}
/** Small block / glide feet under a w × l footprint. */
function glides(k, mat, w, l, h, inset = 0.08, z = 0, mid = false) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', mat, 0.05, h, 0.05, sx * (w / 2 - inset), h / 2, z + sz * (l / 2 - inset), { r: 0.004 });
  if (mid) for (const sz of [-1, 1]) k.box('legs', mat, 0.05, h, 0.05, 0, h / 2, z + sz * (l / 2 - inset), { r: 0.004 });
}

/* -------------------------------------------------------------- beds */

const platformLow = item({
  id: 'bed-platform-low', category: 'bedroom', ko: '저상형 평상 침대', en: 'Low platform bed', size: [1.8, 0.74, 2.22],
  params: [
    pSize('queen'),
    P.len('deck', '평상 여유', 'Deck margin', 0.15, 0.04, 0.35),
    P.len('height', '평상 높이', 'Platform height', 0.2, 0.12, 0.35),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    ...BEDDING('fabric-linen-white', 'fabric-linen-beige', 2),
  ],
  tags: ['platform bed', 'low bed', 'japanese bed', 'floor bed', '저상형 침대', '평상형 침대', '원목 침대', '일본식 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const o = p.deck, hbT = 0.05, ph = p.height;
    const W = mw + 2 * o, L = ml + o + hbT + 0.02;
    const zHead = -L / 2 + hbT + 0.02, zFoot = zHead + ml;
    // recessed black plinth makes the deck look like it hovers
    k.box('base', 'paint-black-matte', W - 0.24, 0.07, L - 0.24, 0, 0.035, 0, { r: 0.002 });
    k.box('frame', p.wood, W, ph - 0.07, L, 0, 0.07 + (ph - 0.07) / 2, 0, { r: 0.01, segs: 2 });
    // low headboard with a shelf ledge on top
    const hbH = 0.48;
    k.box('headboard', p.wood, W, hbH, hbT, 0, ph + hbH / 2, -L / 2 + hbT / 2, { r: 0.008, segs: 2 });
    k.box('headboard', p.wood, W, 0.028, 0.17, 0, ph + hbH + 0.014, -L / 2 + 0.085, { r: 0.006, segs: 2 });
    // mattress lies on the deck
    const mTop = mattress(k, mw, ml, ph, (zHead + zFoot) / 2, 0.2);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - ph - 0.02, foot: true });
    return recentre(k.group());
  },
});

const channelTall = item({
  id: 'bed-channel-tall', category: 'bedroom', ko: '하이 채널 헤드 침대', en: 'Tall channel-tufted bed', size: [1.75, 1.36, 2.22],
  params: [
    pSize('queen'),
    P.len('hbH', '헤드 높이', 'Headboard height', 1.35, 1.0, 1.7),
    P.mat('frameFabric', '프레임 천', 'Frame fabric', 'fabric-cotton-grey', 'fabric'),
    P.mat('feet', '발', 'Feet', 'metal-black', 'metal'),
    ...BEDDING('fabric-cotton-white', 'fabric-linen-beige', 2),
  ],
  tags: ['upholstered bed', 'channel tufted bed', 'tall headboard', '패브릭 침대', '채널 헤드보드', '호텔 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const hb = 0.13, W = mw + 0.08, L = ml + 0.04 + hb, fab = p.frameFabric;
    const zHead = -L / 2 + hb, zFoot = zHead + ml + 0.02;
    const fy = 0.06, fh = 0.28;
    k.soft('frame', fab, W, fh, L - hb, 0.035, 0, fy + fh / 2, hb / 2, { puff: 0.004 });
    glides(k, p.feet, W, L - hb, fy, 0.1, hb / 2, W > 1.3);
    // channels run floor to top, a little wider than the bed
    const hbW = W + 0.16, H = p.hbH;
    const n = Math.max(5, Math.round(hbW / 0.15)), cw = hbW / n;
    for (let i = 0; i < n; i++) k.soft('headboard', fab, cw + 0.002, H - 0.012, hb, Math.min(cw / 2.2, 0.06), -hbW / 2 + cw * (i + 0.5), H / 2 + 0.006, -L / 2 + hb / 2, { puff: 0.012, flat: 3 });
    const mTop = mattress(k, mw, ml, fy + fh - 0.03, (zHead + zFoot) / 2, 0.25);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - fy - fh - 0.015 });
    return recentre(k.group());
  },
});

const wingback = item({
  id: 'bed-wingback', category: 'bedroom', ko: '윙백 침대', en: 'Wingback bed', size: [1.85, 1.28, 2.23],
  params: [
    pSize('queen'),
    P.len('hbH', '헤드 높이', 'Headboard height', 1.25, 1.0, 1.5),
    P.mat('frameFabric', '프레임 천', 'Frame fabric', 'fabric-velvet-green', 'fabric'),
    P.mat('wood', '다리', 'Legs', 'wood-walnut', 'wood'),
    P.bool('tufted', '버튼 터프팅', 'Button tufted', true),
    ...BEDDING('fabric-cotton-white', 'fabric-mustard', 2),
  ],
  tags: ['wingback bed', 'tufted bed', 'upholstered bed', '윙백 침대', '버튼 터프팅', '벨벳 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const hb = 0.14, W = mw + 0.1, L = ml + 0.05 + hb, fab = p.frameFabric, H = p.hbH;
    const zHead = -L / 2 + hb, zFoot = zHead + ml + 0.02;
    const legH = 0.12, fh = 0.24;
    k.soft('frame', fab, W, fh, L - hb + 0.01, 0.035, 0, legH + fh / 2, hb / 2 - 0.005, { puff: 0.005 });
    for (const sx of [-1, 1]) for (const z of [-L / 2 + hb + 0.06, L / 2 - 0.06]) k.cyl('legs', p.wood, 0.026, 0.017, legH, sx * (W / 2 - 0.06), 0, z, { segs: k.seg(14, 6) });
    if (W > 1.3) k.cyl('legs', p.wood, 0.026, 0.017, legH, 0, 0, L / 2 - 0.06, { segs: k.seg(14, 6) });
    // headboard panel + two wings that flare forward
    const hz = -L / 2 + hb / 2;
    k.soft('headboard', fab, W, H - 0.016, hb, 0.05, 0, H / 2 + 0.008, hz, { puff: 0.016, flat: 6 });
    const wd = 0.34, ww = 0.12;
    for (const s of [-1, 1]) k.soft('headboard', fab, ww, H - 0.08, wd, 0.05, s * (W / 2 + ww / 2 - 0.01), (H - 0.08) / 2 + 0.012, -L / 2 + wd / 2, { puff: 0.01, flat: 3, ry: s * 0.12 });
    if (p.tufted) {
      const nx = Math.max(4, Math.round(W / 0.2));
      for (let j = 0; j < 4; j++) {
        const y = 0.62 + j * ((H - 0.75) / 3);
        const m = nx - (j % 2);
        for (let i = 0; i < m; i++) {
          const x = -W / 2 + (W / nx) * (i + 0.5 + (j % 2) * 0.5);
          k.sphere('headboard', fab, 0.012, x, y, -L / 2 + hb + 0.004, { scale: [1, 1, 0.5], segs: 8, rings: 5 });
        }
      }
    }
    const mTop = mattress(k, mw, ml, legH + fh - 0.03, (zHead + zFoot) / 2, 0.25);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - legH - fh - 0.015 });
    return recentre(k.group());
  },
});

/** A gathered sheer panel hanging from (x, top) along z from z0 in direction dir, tied back at tieY. */
function sheerPanel(k, mat, { x, z0, dir, top, bottom, width = 0.5, tieY = 1.0, tieW = 0.1, pleats = 6, amp = 0.025 }) {
  const g = shellGeo(k.seg(28, 8), k.seg(24, 6), (u, v) => {
    const y = top - v * (top - bottom);
    let wv;
    if (y >= tieY) { const t = (top - y) / (top - tieY); wv = width + (tieW - width) * t * t; }
    else { const s = (tieY - y) / (tieY - bottom); wv = tieW + (width * 0.8 - tieW) * Math.sqrt(s); }
    const a = amp * (0.35 + wv / width);
    return [x + a * Math.sin(u * pleats * Math.PI * 2), y, z0 + dir * (0.01 + u * wv)];
  }, 0.004);
  k.add('drapes', mat, g);
}

const canopy = item({
  id: 'bed-canopy', category: 'bedroom', ko: '캐노피 침대', en: 'Canopy bed', size: [1.78, 2.1, 2.14],
  params: [
    pSize('queen'),
    P.len('height', '기둥 높이', 'Post height', 2.1, 1.9, 2.4),
    P.mat('frame', '프레임', 'Frame', 'wood-walnut', 'wood'),
    P.bool('drapes', '쉬어 커튼', 'Sheer drapes', true),
    P.mat('drapeFabric', '커튼 천', 'Drape fabric', 'fabric-linen-white', 'fabric'),
    ...BEDDING('fabric-linen-white', 'fabric-linen-grey', 2),
  ],
  tags: ['canopy bed', 'four poster bed', 'poster bed', '캐노피 침대', '포스터 침대', '공주 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const t = 0.06, W = mw + 0.06 + 2 * t, L = ml + 0.02 + 2 * t, H = p.height, m = p.frame;
    const zHead = -L / 2 + t + 0.01, zFoot = zHead + ml;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', m, t, H, t, sx * (W / 2 - t / 2), H / 2, sz * (L / 2 - t / 2), { r: 0.006, segs: 2 });
    // canopy rails
    for (const sz of [-1, 1]) k.box('frame', m, W - 2 * t + 0.004, 0.05, 0.04, 0, H - 0.04, sz * (L / 2 - t / 2), { r: 0.004 });
    for (const sx of [-1, 1]) k.box('frame', m, 0.04, 0.05, L - 2 * t + 0.004, sx * (W / 2 - t / 2), H - 0.04, 0, { r: 0.004 });
    // side rails, low foot rail, panelled headboard between the head posts
    const ry = 0.2, rh = 0.2;
    for (const sx of [-1, 1]) k.box('frame', m, 0.035, rh, L - 2 * t + 0.004, sx * (W / 2 - t / 2), ry + rh / 2, 0, { r: 0.004 });
    k.box('frame', m, W - 2 * t + 0.004, rh, 0.035, 0, ry + rh / 2, L / 2 - t / 2, { r: 0.004 });
    k.box('frame', m, W - 2 * t + 0.004, 0.85, 0.03, 0, ry + 0.425, -L / 2 + t / 2, { r: 0.004 });
    k.box('frame', m, W - 2 * t + 0.004, 0.05, 0.05, 0, ry + 0.85 + 0.025, -L / 2 + t / 2, { r: 0.006, segs: 2 });
    const mTop = mattress(k, mw, ml, ry + rh - 0.08, (zHead + zFoot) / 2, 0.26);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - ry - rh - 0.015, foot: false });
    if (p.drapes) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        sheerPanel(k, p.drapeFabric, { x: sx * (W / 2 + 0.012), z0: sz * (L / 2 - t), dir: -sz, top: H - 0.07, bottom: 0.02, width: 0.5, tieY: 1.05 });
        k.rbox('drapes', p.drapeFabric, 0.03, 0.05, 0.13, 0.01, sx * (W / 2 + 0.012), 1.05, sz * (L / 2 - t - 0.075), { segs: 2 });
      }
    }
    return recentre(k.group());
  },
});

/** Turned post (lathe) with a square-ish block where the rails join and a ball finial. */
function turnedPost(k, role, mat, h, x, z, r = 0.035) {
  const prof = [
    [0, 0], [r * 0.9, 0], [r * 0.95, 0.02], [r * 0.78, 0.06], [r * 1.2, 0.12], [r * 1.2, 0.46], [r * 0.95, 0.5], [r * 0.75, 0.56],
    [r * 0.9, 0.62], [r * 0.7, h * 0.5 + 0.2], [r * 0.62, h - 0.16], [r * 0.95, h - 0.13], [r * 0.95, h - 0.11], [r * 0.45, h - 0.09],
    [r * 0.95, h - 0.055], [r * 0.8, h - 0.02], [r * 0.3, h - 0.002], [0, h],
  ].filter((v, i, a) => i === 0 || v[1] > a[i - 1][1]);
  k.lathe(role, mat, prof, x, 0, z, { segs: k.seg(16, 6) });
}

const fourPoster = item({
  id: 'bed-four-poster', category: 'bedroom', ko: '클래식 포스터 침대', en: 'Turned four-poster bed', size: [1.7, 1.45, 2.13],
  params: [
    pSize('queen'),
    P.mat('wood', '나무', 'Wood', 'wood-dark', 'wood'),
    ...BEDDING('fabric-cotton-white', 'fabric-navy', 3),
  ],
  tags: ['four poster bed', 'classic bed', 'turned posts', '포스터 침대', '클래식 침대', '원목 침대', '앤틱'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const r = 0.04, W = mw + 0.04 + 2 * r * 1.2, L = ml + 0.03 + 2 * r * 1.2, m = p.wood;
    const xs = W / 2 - r * 1.2, zs = L / 2 - r * 1.2;
    const zHead = -zs + 0.01, zFoot = zHead + ml;
    for (const sx of [-1, 1]) { turnedPost(k, 'frame', m, 1.45, sx * xs, -zs, r); turnedPost(k, 'frame', m, 1.0, sx * xs, zs, r); }
    // side rails into the post blocks
    for (const sx of [-1, 1]) k.box('frame', m, 0.035, 0.22, 2 * zs, sx * xs, 0.32, 0, { r: 0.004 });
    // arched headboard + lower footboard panels between the posts
    const pw = 2 * xs;
    const arch = (w, h, rise) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.quadraticCurveTo(0, h + rise * 2, -w / 2, h); s.lineTo(-w / 2, 0); return s; };
    k.panel('frame', m, arch(pw, 0.7, 0.12), 0.03, 0, 0.21, -zs, { bevel: 0.006 });
    k.panel('frame', m, arch(pw, 0.36, 0.05), 0.03, 0, 0.21, zs, { bevel: 0.006 });
    // raised panel mouldings on the headboard
    for (const sx of [-1, 1]) k.panel('frame', m, frameShape(pw * 0.38, 0.4, 0.03, 0.03, 0.01), 0.012, sx * pw * 0.23, 0.6, -zs + 0.018, { bevel: 0.003 });
    const mTop = mattress(k, mw, ml, 0.36, (zHead + zFoot) / 2, 0.27);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - 0.43 - 0.015, foot: false });
    return recentre(k.group());
  },
});

const storageDrawers = item({
  id: 'bed-storage-drawers', category: 'bedroom', ko: '수납 서랍 침대', en: 'Storage bed with drawers', size: [1.65, 0.95, 2.28],
  params: [
    pSize('queen'),
    P.int('drawers', '측면 서랍 수', 'Drawers per side', 2, 1, 3),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '서랍 전면', 'Drawer fronts', 'wood-oak', 'wood'),
    ...BEDDING('fabric-cotton-grey', 'fabric-mustard', 2),
  ],
  tags: ['storage bed', 'drawer bed', 'bookcase headboard', '수납 침대', '서랍 침대', '책장 헤드', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const hbD = 0.22, W = mw + 0.06, L = ml + 0.04 + hbD;
    const zHead = -L / 2 + hbD + 0.01, zFoot = zHead + ml;
    const zc = hbD / 2, fl = L - hbD, plinth = 0.06, fh = 0.3;
    k.box('base', 'paint-black-matte', W - 0.1, plinth, fl - 0.1, 0, plinth / 2, zc, { r: 0.002 });
    k.box('frame', p.body, W, fh, fl, 0, plinth + fh / 2, zc, { r: 0.004 });
    // drawers on both long sides (fronts face ±x), with edge pulls
    const n = p.drawers, span = fl - 0.3, dl = span / n, dh = fh - 0.05;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const z = zHead + 0.08 + dl * (i + 0.5);
      k.box('fronts', p.front, 0.018, dh, dl - 0.006, s * (W / 2 + 0.009), plinth + fh / 2, z, { r: 0.0025 });
      k.box('handles', 'metal-black', 0.02, 0.014, Math.min(0.3, dl * 0.45), s * (W / 2 + 0.028), plinth + fh / 2 + dh / 2 - 0.012, z, { r: 0.002 });
    }
    // bookcase headboard: solid lower part, three open cubbies above
    const hbH = 0.95, hz = -L / 2 + hbD / 2, low = 0.66, t = 0.022;
    k.box('headboard', p.body, W, low, hbD, 0, low / 2, hz, { r: 0.004 });
    k.box('headboard', p.body, W, hbH - low, 0.018, 0, low + (hbH - low) / 2, -L / 2 + 0.009, { r: 0.002 });
    k.box('headboard', p.body, W, t, hbD, 0, hbH - t / 2, hz, { r: 0.004 });
    for (const x of [-W / 2 + t / 2, -W / 6, W / 6, W / 2 - t / 2]) k.box('headboard', p.body, t, hbH - low - t, hbD, x, low + (hbH - low - t) / 2, hz, { r: 0.002 });
    k.box('fronts', p.front, W - 0.002, 0.02, hbD + 0.002, 0, low - 0.01, hz, { r: 0.003 });
    const mTop = mattress(k, mw, ml, plinth + fh, (zHead + zFoot) / 2, 0.22);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: 0.07, foot: true });
    return recentre(k.group());
  },
});

const ottoman = item({
  id: 'bed-ottoman', category: 'bedroom', ko: '리프트업 수납 침대', en: 'Ottoman lift-up bed', size: [1.7, 1.16, 2.18],
  params: [
    pSize('queen'),
    P.mat('frameFabric', '프레임 천', 'Frame fabric', 'fabric-linen-grey', 'fabric'),
    P.int('rolls', '헤드 가로 줄', 'Headboard rolls', 4, 3, 6),
    ...BEDDING('fabric-cotton-white', 'fabric-wool-charcoal', 2),
  ],
  tags: ['ottoman bed', 'lift up bed', 'storage bed', '리프트업 침대', '수납 침대', '패브릭 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const hb = 0.1, W = mw + 0.06, Lb = ml + 0.04, L = Lb + hb, fab = p.frameFabric;
    const zHead = -L / 2 + hb + 0.01, zFoot = zHead + ml, zc = hb / 2;
    const gy = 0.02, bh = 0.36;
    k.soft('frame', fab, W, bh, Lb, 0.03, 0, gy + bh / 2, zc, { puff: 0.004 });
    // piping where the lifting lid meets the box
    piping(k, 'frame', fab, W + 0.004, Lb + 0.004, 0.03, gy + bh - 0.045, zc, 0.006);
    glides(k, 'plastic-black', W, Lb, gy, 0.06, zc);
    // horizontal channel rolls above a flat lower panel
    const H = 1.15, low = 0.5, n = p.rolls, rh = (H - low) / n, hbW = W + 0.04, hz = -L / 2 + hb / 2;
    k.soft('headboard', fab, hbW, low, hb * 0.8, 0.02, 0, low / 2, hz - hb * 0.1, { flat: 3 });
    for (let i = 0; i < n; i++) k.soft('headboard', fab, hbW, rh + 0.002, hb, Math.min(rh / 2.2, 0.05), 0, low + rh * (i + 0.5), hz, { puff: 0.01, flat: 3 });
    const mTop = mattress(k, mw, ml, gy + bh - 0.02, (zHead + zFoot) / 2, 0.24);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - gy - bh - 0.015 });
    return recentre(k.group());
  },
});

const daybed = item({
  id: 'bed-daybed-trundle', category: 'bedroom', ko: '데이베드(트런들)', en: 'Daybed with trundle', size: [2.01, 0.95, 1.01],
  params: [
    P.pick('trundle', '보조 침대', 'Trundle', 'closed', [['none', '없음', 'None'], ['closed', '닫힘', 'Closed'], ['open', '꺼냄', 'Pulled out']]),
    P.mat('frame', '프레임', 'Frame', 'wood-white', 'wood'),
    P.mat('beddingFabric', '매트 커버', 'Mattress cover', 'fabric-linen-beige', 'fabric'),
    P.mat('throwFabric', '쿠션·담요', 'Cushions & throw', 'fabric-terracotta', 'fabric'),
    P.int('pillows', '쿠션 수', 'Cushions', 3, 0, 4),
  ],
  tags: ['daybed', 'trundle bed', 'guest bed', '데이베드', '트런들 침대', '손님 침대', '소파 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const mw = 0.9, ml = 1.9, t = 0.05, m = p.frame;
    const W = ml + 2 * t + 0.01, D = mw + 2 * t + 0.01;
    const xs = W / 2 - t / 2, zs = D / 2 - t / 2;
    // corner posts: back posts tall, front posts at arm height
    for (const sx of [-1, 1]) { k.box('frame', m, t, 0.95, t, sx * xs, 0.475, -zs, { r: 0.006, segs: 2 }); k.box('frame', m, t, 0.75, t, sx * xs, 0.375, zs, { r: 0.006, segs: 2 }); }
    // aprons around the deck
    const ay = 0.22, ah = 0.16;
    for (const sz of [-1, 1]) k.box('frame', m, W - 2 * t + 0.004, ah, 0.03, 0, ay + ah / 2, sz * zs, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('frame', m, 0.03, ah, D - 2 * t + 0.004, sx * xs, ay + ah / 2, 0, { r: 0.003 });
    // back: top rail + vertical slats; arms: top rail + slats
    const top = ay + ah;
    k.box('frame', m, W - 2 * t + 0.004, 0.05, 0.035, 0, 0.92, -zs, { r: 0.004 });
    const nb = Math.round((W - 2 * t) / 0.11);
    for (let i = 0; i < nb; i++) k.box('frame', m, 0.03, 0.92 - top, 0.018, -W / 2 + t + ((W - 2 * t) / nb) * (i + 0.5), top + (0.92 - top) / 2, -zs, { r: 0.003 });
    for (const sx of [-1, 1]) {
      k.box('frame', m, 0.035, 0.05, D - 2 * t + 0.004, sx * xs, 0.72, 0, { r: 0.004 });
      for (let i = 0; i < 6; i++) k.box('frame', m, 0.018, 0.72 - top, 0.03, sx * xs, top + (0.72 - top) / 2, -D / 2 + t + ((D - 2 * t) / 6) * (i + 0.5), { r: 0.003 });
    }
    // mattress (lengthwise along x) in a fitted cover
    const mTop = top - 0.03 + 0.16;
    k.soft('mattress', p.beddingFabric, ml - 0.01, 0.16, mw - 0.01, 0.045, 0, top - 0.03 + 0.08, 0, { puff: 0.008 });
    // trundle box below
    if (p.trundle !== 'none') {
      const out = p.trundle === 'open' ? mw * 0.95 : 0;
      const tw = ml - 0.06, td = mw - 0.06, th = 0.17;
      k.box('frame', m, tw, th - 0.02, td, 0, 0.02 + (th - 0.02) / 2, out - 0.01, { r: 0.003 });
      k.box('frame', m, tw + 0.02, th, 0.022, 0, 0.012 + th / 2, out + td / 2 - 0.0, { r: 0.004 });
      for (const sx of [-1, 1]) addHandle(k, 'handles', 'metal-brass', 'knob', sx * tw * 0.3, 0.012 + th / 2, out + td / 2 + 0.011);
      if (out > 0) k.soft('mattress', p.beddingFabric, ml - 0.12, 0.12, td - 0.04, 0.035, 0, th + 0.05, out - 0.01, { puff: 0.006 });
    }
    // cushions lean against the back, throw folded over the right end
    const n = p.pillows;
    for (let i = 0; i < n; i++) {
      const g = pillowGeo(0.52, 0.46, 0.16, k.seg(16, 6));
      T(g, 0, 0, 0, -0.32, 0, (i - (n - 1) / 2) * 0.04);
      g.translate(-ml / 2 + 0.36 + (ml - 0.72) * (n > 1 ? i / (n - 1) : 0.5), mTop + 0.2, -mw / 2 + 0.13);
      k.add('pillows', i % 2 ? p.beddingFabric : p.throwFabric, g);
    }
    const tw = clothGeo({ w: 0.42, l: mw - 0.1, top: mTop, drop: 0.12, r: 0.03, thick: 0.02, nu: k.seg(16, 6), nv: k.seg(12, 4), sides: { left: true, right: true, foot: true }, folds: 0.008, seed: 4 });
    tw.translate(ml / 2 - 0.4, 0, 0.0);
    k.add('throw', p.throwFabric, tw);
    return recentre(k.group());
  },
});

/** Sleigh scroll profile in (s, y): s = forward from the board face, curls back at the top. */
function sleighShape(H, dir = 1) {
  const sh = new THREE.Shape(), f = (s) => s * dir;
  const pts = [];
  sh.moveTo(f(-0.03), 0);
  sh.lineTo(f(0.07), 0);
  sh.lineTo(f(0.07), H * 0.3);
  sh.bezierCurveTo(f(0.07), H * 0.62, f(0.0), H * 0.8, f(-0.07), H * 0.93);
  sh.quadraticCurveTo(f(-0.12), H * 1.0, f(-0.17), H * 0.955);
  sh.quadraticCurveTo(f(-0.2), H * 0.9, f(-0.14), H * 0.87);
  sh.bezierCurveTo(f(-0.07), H * 0.8, f(-0.03), H * 0.65, f(-0.03), H * 0.32);
  sh.lineTo(f(-0.03), 0);
  void pts;
  return sh;
}

const sleigh = item({
  id: 'bed-sleigh', category: 'bedroom', ko: '슬레이 침대', en: 'Sleigh bed', size: [1.69, 1.09, 2.53],
  params: [
    pSize('queen'),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    ...BEDDING('fabric-cotton-white', 'fabric-linen-beige', 2),
  ],
  tags: ['sleigh bed', 'classic bed', 'scroll bed', '슬레이 침대', '클래식 침대', '원목 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const W = mw + 0.1, m = p.wood;
    const zHead = 0, zFoot = ml; // laid out from the head, recentred at the end
    // boards: profiles extruded across the width (ry −90°: shape x → +z)
    k.panel('headboard', m, sleighShape(1.12, 1), W, 0, 0, zHead - 0.08, { ry: -Math.PI / 2, bevel: 0.012, curveSegs: 20 });
    k.panel('headboard', m, sleighShape(0.72, -1), W, 0, 0, zFoot + 0.09, { ry: -Math.PI / 2, bevel: 0.012, curveSegs: 20 });
    // side rails
    for (const s of [-1, 1]) k.box('frame', m, 0.04, 0.22, ml + 0.1, s * (W / 2 - 0.02), 0.34, ml / 2, { r: 0.008, segs: 2 });
    const mTop = mattress(k, mw, ml, 0.36, ml / 2, 0.25);
    dress(k, p, { mw, ml, mTop, zHead: zHead + 0.0, zFoot, drop: mTop - 0.45 - 0.015, foot: false });
    return recentre(k.group());
  },
});

const ironSpindle = item({
  id: 'bed-iron-spindle', category: 'bedroom', ko: '철제 스핀들 침대', en: 'Iron spindle bed', size: [1.7, 1.28, 2.12],
  params: [
    pSize('queen'),
    P.mat('metal', '철제', 'Iron', 'metal-black', 'metal'),
    P.mat('finials', '장식 볼', 'Finials', 'metal-brass', 'metal'),
    ...BEDDING('fabric-linen-white', 'fabric-terracotta', 2),
  ],
  tags: ['iron bed', 'metal bed', 'spindle bed', 'vintage bed', '철제 침대', '메탈 침대', '빈티지 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const r = 0.02, W = mw + 0.06, L = ml + 0.06, m = p.metal;
    const xs = W / 2, zs = L / 2;
    const zHead = -zs + 0.03, zFoot = zHead + ml;
    const end = (z, H, low, arch) => {
      for (const sx of [-1, 1]) {
        k.cyl('frame', m, r, r, H, sx * xs, 0, z, { segs: k.seg(14, 6) });
        k.sphere('finials', p.finials, r * 1.6, sx * xs, H + r * 1.2, z, { segs: k.seg(16, 8), rings: k.seg(10, 5) });
        k.cyl('finials', p.finials, r * 1.3, r * 1.4, 0.03, sx * xs, 0, z, { segs: k.seg(14, 6) });
      }
      const yTop = (x) => H - 0.08 + arch * Math.cos((x / xs) * Math.PI / 2);
      const pts = [];
      for (let i = 0; i <= 16; i++) { const x = -xs + (2 * xs * i) / 16; pts.push([x, yTop(x), z]); }
      k.tube('frame', m, pts, r * 0.8, { segs: k.seg(48, 12), radial: k.seg(10, 5) });
      k.rod('frame', m, [-xs, low, z], [xs, low, z], r * 0.8, { segs: k.seg(10, 5) });
      const n = Math.round((2 * xs) / 0.1);
      for (let i = 1; i < n; i++) { const x = -xs + (2 * xs * i) / n; k.rod('frame', m, [x, low, z], [x, yTop(x), z], 0.007, { segs: k.seg(8, 4) }); }
    };
    end(-zs, 1.22, 0.48, 0.08);
    end(zs, 0.88, 0.42, 0.03);
    // angle-iron side rails
    for (const s of [-1, 1]) k.box('frame', m, 0.035, 0.05, L, s * (mw / 2 + 0.018), 0.33, 0, { r: 0.003 });
    const mTop = mattress(k, mw, ml, 0.34, (zHead + zFoot) / 2, 0.26);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - 0.36 - 0.015, foot: false });
    return recentre(k.group());
  },
});

const cane = item({
  id: 'bed-cane', category: 'bedroom', ko: '라탄 헤드 침대', en: 'Cane headboard bed', size: [1.7, 1.1, 2.12],
  params: [
    pSize('queen'),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('cane', '라탄', 'Cane', 'rattan', 'wood'),
    ...BEDDING('fabric-linen-white', 'fabric-linen-beige', 2),
  ],
  tags: ['cane bed', 'rattan bed', 'boho bed', '라탄 침대', '등나무 침대', '보헤미안', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const W = mw + 0.08, hbT = 0.045, L = ml + 0.04 + hbT, m = p.wood;
    const zHead = -L / 2 + hbT + 0.01, zFoot = zHead + ml;
    const legH = 0.2, fh = 0.16;
    k.box('frame', m, W, fh, L - hbT, 0, legH + fh / 2, hbT / 2, { r: 0.012, segs: 2 });
    splayLegs(k, 'legs', m, W, L - hbT - 0.02, legH, { inset: 0.06, r: 0.026, rFoot: 0.016, splay: 0.02 });
    if (W > 1.3) k.cyl('legs', m, 0.022, 0.016, legH, 0, 0, L / 2 - 0.1, { segs: k.seg(12, 6) });
    // arched frame with a woven cane infill, standing on the floor
    const H = 1.1, R = Math.min(0.35, W / 3), hz = -L / 2 + hbT / 2;
    k.panel('headboard', m, ringShape(topRound(W, H, R), topRound(W - 0.1, H - 0.1, R - 0.05, 0.05)), hbT, 0, 0, hz, { bevel: 0.008, curveSegs: 16 });
    k.panel('cane', p.cane, topRound(W - 0.08, H - 0.08, R - 0.04, 0.04), 0.012, 0, 0, hz, { bevel: 0.002, curveSegs: 16 });
    const mTop = mattress(k, mw, ml, legH + fh - 0.03, (zHead + zFoot) / 2, 0.24);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - legH - fh - 0.015 });
    return recentre(k.group());
  },
});

const floating = item({
  id: 'bed-floating', category: 'bedroom', ko: '플로팅 침대(LED)', en: 'Floating bed with LED', size: [2.6, 1, 2.13],
  params: [
    pSize('queen'),
    P.bool('sideTables', '일체형 협탁', 'Built-in side tables', true),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('fabric', '헤드 패드', 'Headboard pad', 'leather-white', 'leather'),
    ...BEDDING('fabric-cotton-white', 'fabric-wool-charcoal', 2),
  ],
  tags: ['floating bed', 'led bed', 'modern bed', '플로팅 침대', '간접조명 침대', '모던 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const hbT = 0.06, W = mw + 0.1, L = ml + 0.05 + hbT, m = p.wood;
    const zHead = -L / 2 + hbT + 0.01, zFoot = zHead + ml, zc = hbT / 2, pl = L - hbT;
    const py = 0.18, pt = 0.12;
    k.box('base', 'paint-black-matte', W - 0.6, py, pl - 0.6, 0, py / 2, zc, { r: 0.002 });
    k.box('frame', m, W, pt, pl, 0, py + pt / 2, zc, { r: 0.008, segs: 2 });
    // LED strips under the overhang
    for (const s of [-1, 1]) k.box('led', 'light-warm', 0.012, 0.006, pl - 0.5, s * (W / 2 - 0.29), py - 0.004, zc, { r: 0 });
    k.box('led', 'light-warm', W - 0.58, 0.006, 0.012, 0, py - 0.004, zc + pl / 2 - 0.29, { r: 0 });
    k.light(0, 0.06, zc + pl / 2 - 0.2, { color: '#ffd59a', intensity: 0.4, distance: 2 });
    // full-height headboard panel (wider with side tables) and a padded pad
    const side = p.sideTables ? 0.5 : 0, hbW = W + 2 * side, H = 1.0;
    k.box('headboard', m, hbW, H, hbT, 0, H / 2, -L / 2 + hbT / 2, { r: 0.006, segs: 2 });
    k.soft('pad', p.fabric, W - 0.1, 0.42, 0.05, 0.02, 0, 0.75, -L / 2 + hbT + 0.024, { puff: 0.006, flat: 3 });
    if (side) for (const s of [-1, 1]) {
      const x = s * (W / 2 + side / 2 + 0.02);
      k.box('frame', m, side - 0.06, 0.14, 0.38, x, 0.48, -L / 2 + hbT + 0.19, { r: 0.006, segs: 2 });
      k.box('fronts', 'paint-black-matte', side - 0.14, 0.006, 0.003, x, 0.47, -L / 2 + hbT + 0.38 + 0.001, { r: 0 });
    }
    const mTop = mattress(k, mw, ml, py + pt, (zHead + zFoot) / 2, 0.24);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - py - pt - 0.015 });
    return recentre(k.group());
  },
});

const murphy = item({
  id: 'bed-murphy', category: 'bedroom', ko: '머피 침대(벽 수납)', en: 'Murphy wall bed', size: [1.64, 2.2, 2.5],
  params: [
    pSize('queen'),
    P.bool('sideCabinets', '양옆 수납장', 'Side cabinets', false),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '전면', 'Front panel', 'wood-oak', 'wood'),
    ...BEDDING('fabric-cotton-white', 'fabric-navy', 2, false),
  ],
  tags: ['murphy bed', 'wall bed', 'fold down bed', '머피 침대', '벽 침대', '접이식 침대', '공간 절약'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const Wc = mw + 0.14, H = 2.2, Dc = 0.42, t = 0.02;
    const zb = 0; // cabinet back
    // cabinet (open, the bed has folded down out of it)
    for (const s of [-1, 1]) k.box('body', p.body, t, H, Dc, s * (Wc / 2 - t / 2), H / 2, zb + Dc / 2, { r: 0.002 });
    k.box('body', p.body, Wc, 0.04, Dc, 0, H - 0.02, zb + Dc / 2, { r: 0.003 });
    k.box('body', p.body, Wc - 2 * t, H - 0.04, 0.016, 0, (H - 0.04) / 2, zb + 0.008, { r: 0.001 });
    k.box('body', p.body, Wc - 2 * t, 0.12, 0.02, 0, H - 0.1, zb + Dc - 0.01, { r: 0.002 });
    k.box('body', p.body, Wc - 2 * t, 0.018, Dc - 0.05, 0, 1.75, zb + Dc / 2, { r: 0.001 });
    // bed frame = the door panel lying flat, with mattress rails and a fold-down leg
    const z0 = zb + Dc - 0.02, bl = ml + 0.08, fw = mw + 0.06;
    k.box('fronts', p.front, fw, 0.03, bl, 0, 0.27, z0 + bl / 2, { r: 0.003 });
    for (const s of [-1, 1]) k.box('body', p.body, 0.025, 0.1, bl, s * (fw / 2 - 0.0125), 0.33, z0 + bl / 2, { r: 0.002 });
    k.box('body', p.body, fw, 0.1, 0.025, 0, 0.33, z0 + bl - 0.0125, { r: 0.002 });
    k.box('body', p.body, fw - 0.1, 0.255, 0.025, 0, 0.1275, z0 + bl - 0.08, { r: 0.002 });
    // pivot block
    k.box('handles', 'metal-black', Wc - 2 * t - 0.01, 0.06, 0.06, 0, 0.3, z0, { r: 0.004 });
    const zHead = z0 + 0.04, zFoot = zHead + ml;
    const mTop = mattress(k, mw, ml, 0.285, (zHead + zFoot) / 2, 0.22);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: mTop - 0.38 - 0.015, lean: 0.35 });
    if (p.sideCabinets) for (const s of [-1, 1]) {
      addCabinet(k, { w: 0.45, h: H, d: Dc, x: s * (Wc / 2 + 0.225), z: zb + Dc / 2, rows: [{ h: 1, n: 1, type: 'door', hinge: s < 0 ? 'left' : 'right' }], body: p.body, front: p.front, handle: 'edge', handleMat: 'metal-black', base: 'plinth', plinth: 0.06 });
    }
    return recentre(k.group());
  },
});

const YO_SIZES = { single: [1.0, 2.1], double: [1.4, 2.1], queen: [1.6, 2.1] };
const yo = item({
  id: 'bed-korean-yo', category: 'bedroom', ko: '요·이불 세트(바닥 침구)', en: 'Korean floor bedding (yo)', size: [1.51, 0.21, 2.15],
  params: [
    P.pick('yoSize', '크기', 'Size', 'double', [['single', '싱글 1000×2100', 'Single 1000×2100'], ['double', '더블 1400×2100', 'Double 1400×2100'], ['queen', '퀸 1600×2100', 'Queen 1600×2100']]),
    P.len('thick', '요 두께', 'Mattress thickness', 0.07, 0.04, 0.14),
    P.mat('yoFabric', '요 천', 'Yo fabric', 'fabric-cotton-white', 'fabric'),
    P.bool('bedding', '이불', 'Quilt (ibul)', true),
    P.mat('beddingFabric', '이불 천', 'Quilt fabric', 'fabric-velvet-rose', 'fabric'),
    P.bool('throw', '홑이불', 'Light blanket', false),
    P.mat('throwFabric', '홑이불 천', 'Blanket fabric', 'fabric-cotton-grey', 'fabric'),
    P.int('pillows', '베개 수', 'Pillows', 2, 0, 3),
  ],
  tags: ['yo', 'floor mattress', 'korean bedding', 'futon', '요', '이불', '바닥 침구', '요이불 세트', '한국식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = YO_SIZES[p.yoSize] ?? YO_SIZES.double;
    const h = p.thick;
    k.soft('mattress', p.yoFabric, mw, h, ml, Math.min(0.03, h * 0.4), 0, h / 2 + 0.012, 0, { puff: 0.012 });
    // quilting tufts in a diamond pattern on the yo
    if (k.hi) for (let j = 0; j < 7; j++) for (let i = 0; i < 4 - (j % 2); i++) k.sphere('mattress', p.yoFabric, 0.008, -mw / 2 + (mw / 4) * (i + 0.5 + (j % 2) * 0.5), h + 0.02, -ml / 2 + 0.12 + j * ((ml - 0.24) / 6), { scale: [1, 0.4, 1], segs: 6, rings: 3 });
    dress(k, p, { mw, ml, mTop: h + 0.024, zHead: -ml / 2, zFoot: ml / 2, drop: h + 0.005, lean: 0.0, accent: false, pillowLen: 0.36, pillowW: 0.55, fold: 0.6 });
    return recentre(k.group());
  },
});

const beddingStack = item({
  id: 'bedding-stack-folded', category: 'bedroom', ko: '개어 둔 이불', en: 'Folded bedding stack', size: [1.02, 0.4, 0.57],
  params: [
    P.int('count', '이불 수', 'Quilts', 3, 2, 5),
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.3),
    P.mat('fabric1', '이불 1', 'Quilt 1', 'fabric-linen-beige', 'fabric'),
    P.mat('fabric2', '이불 2', 'Quilt 2', 'fabric-cotton-white', 'fabric'),
    P.mat('fabric3', '이불 3', 'Quilt 3', 'fabric-velvet-rose', 'fabric'),
    P.int('pillows', '베개 수', 'Pillows', 2, 0, 2),
  ],
  tags: ['folded quilts', 'bedding stack', 'futon stack', '이불 더미', '개어 둔 이불', '요 이불', '침구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.55, mats = [p.fabric1, p.fabric2, p.fabric3];
    const rand = rng(3);
    let y = 0.01;
    for (let i = 0; i < p.count; i++) {
      const h = 0.11 - (i % 2) * 0.02;
      const dx = (rand() - 0.5) * 0.03, dz = (rand() - 0.5) * 0.02;
      k.soft('quilts', mats[i % 3], w - i * 0.01, h, d - 0.01 * (i % 2), Math.min(0.045, h / 2.2), dx, y + h / 2, dz, { puff: 0.01, sag: 0.006, ry: (rand() - 0.5) * 0.04 });
      y += h - 0.008;
    }
    for (let i = 0; i < p.pillows; i++) {
      const g = pillowGeo(0.5, 0.32, 0.12, k.seg(14, 6));
      T(g, 0, 0, 0, -Math.PI / 2, 0, 0);
      g.translate((i - (p.pillows - 1) / 2) * Math.min(0.52, w / 2), y + 0.04 + i * 0.0, 0);
      k.add('pillows', 'fabric-cotton-white', g);
    }
    return recentre(k.group());
  },
});

const mattressOnly = item({
  id: 'mattress-pillow-top', category: 'bedroom', ko: '매트리스(필로우탑)', en: 'Pillow-top mattress', size: [1.53, 0.31, 2.01],
  params: [
    pSize('queen'),
    P.len('thick', '두께', 'Thickness', 0.3, 0.16, 0.4),
    P.bool('pillowTop', '필로우탑', 'Pillow top', true),
    P.mat('fabric', '커버', 'Cover', 'fabric-cotton-white', 'fabric'),
    P.mat('border', '측면 띠', 'Side border', 'fabric-cotton-grey', 'fabric'),
  ],
  tags: ['mattress', 'pillow top', 'spring mattress', '매트리스', '필로우탑', '스프링 매트리스', '토퍼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const pt = p.pillowTop ? 0.06 : 0, bh = p.thick - pt;
    k.soft('border', p.border, mw, bh - 0.004, ml, 0.025, 0, bh / 2 + 0.002, 0, { puff: 0.004, flat: 4 });
    // quilted top face: a thin cover panel + tufts
    k.soft('cover', p.fabric, mw - 0.004, 0.03, ml - 0.004, 0.012, 0, bh - 0.013, 0, { puff: 0.004, flat: 4 });
    piping(k, 'piping', p.fabric, mw - 0.004, ml - 0.004, 0.03, bh + 0.001, 0, 0.006);
    piping(k, 'piping', p.fabric, mw - 0.004, ml - 0.004, 0.03, 0.012, 0, 0.006);
    let top = bh;
    if (pt) {
      k.soft('cover', p.fabric, mw - 0.03, pt + 0.004, ml - 0.03, 0.028, 0, bh + pt / 2 - 0.002, 0, { puff: 0.012 });
      piping(k, 'piping', p.fabric, mw - 0.034, ml - 0.034, 0.028, bh + 0.004, 0, 0.005);
      top = bh + pt;
    }
    if (k.hi) {
      const nx = Math.max(4, Math.round(mw / 0.2)), nz = 10;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) k.sphere('cover', p.fabric, 0.007, -mw / 2 + (mw / nx) * (i + 0.5), top + 0.004 + (pt ? 0.008 : 0), -ml / 2 + (ml / nz) * (j + 0.5), { scale: [1, 0.4, 1], segs: 6, rings: 3 });
    }
    // carry handles on the long sides
    for (const s of [-1, 1]) for (const z of [-0.4, 0.4]) k.box('piping', p.border, 0.012, 0.03, 0.16, s * (mw / 2 + 0.007), bh * 0.5, z, { r: 0.004 });
    return k.group();
  },
});

const divan = item({
  id: 'bed-divan-skirt', category: 'bedroom', ko: '박스스프링 침대(스커트)', en: 'Divan bed with bed skirt', size: [1.7, 1.31, 2.18],
  params: [
    pSize('queen'),
    P.mat('skirt', '베드 스커트', 'Bed skirt', 'fabric-linen-grey', 'fabric'),
    P.mat('frameFabric', '헤드 천', 'Headboard fabric', 'fabric-linen-beige', 'fabric'),
    P.mat('wood', '헤드 다리', 'Headboard struts', 'wood-dark', 'wood'),
    ...BEDDING('fabric-cotton-white', 'fabric-velvet-blue', 3),
  ],
  tags: ['divan bed', 'box spring bed', 'bed skirt', '박스 스프링', '베드 스커트', '호텔 침대', '침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const hb = 0.09, L = ml + hb + 0.03;
    const zHead = -L / 2 + hb + 0.03, zFoot = zHead + ml, zc = (zHead + zFoot) / 2;
    // box spring on glides, dressed in a pleated skirt to the floor
    const by = 0.08, bh = 0.26, bTop = by + bh;
    k.soft('base', p.skirt, mw, bh, ml, 0.02, 0, by + bh / 2, zc, { flat: 3 });
    const skirt = clothGeo({ w: mw, l: ml, top: bTop - 0.004, drop: (bTop - 0.01) / 1.12, r: 0.012, thick: 0.004, folds: 0.012, foldPitch: 0.09, nu: k.seg(48, 14), nv: k.seg(44, 12), puffy: 0, seed: 9 });
    skirt.translate(0, 0, zc);
    k.add('skirt', p.skirt, skirt);
    // upholstered headboard with a piped border on two wooden struts
    const W = mw + 0.08, H = 1.3, panelH = 0.72, hz = -L / 2 + hb / 2;
    k.soft('headboard', p.frameFabric, W, panelH, hb - 0.02, 0.035, 0, H - panelH / 2, hz, { puff: 0.012 });
    for (const [a, b] of [[[-W / 2 + 0.02, H - 0.02], [W / 2 - 0.02, H - 0.02]], [[-W / 2 + 0.02, H - panelH + 0.02], [W / 2 - 0.02, H - panelH + 0.02]], [[-W / 2 + 0.02, H - panelH + 0.02], [-W / 2 + 0.02, H - 0.02]], [[W / 2 - 0.02, H - panelH + 0.02], [W / 2 - 0.02, H - 0.02]]]) {
      k.rod('headboard', p.frameFabric, [a[0], a[1], hz + (hb - 0.02) / 2 + 0.002], [b[0], b[1], hz + (hb - 0.02) / 2 + 0.002], 0.006, { segs: k.seg(8, 4) });
    }
    for (const s of [-1, 1]) k.box('struts', p.wood, 0.07, H - panelH + 0.05, 0.05, s * (W / 2 - 0.12), (H - panelH + 0.05) / 2, -L / 2 + 0.03, { r: 0.006, segs: 2 });
    const mTop = mattress(k, mw, ml, bTop, zc, 0.26);
    dress(k, p, { mw, ml, mTop, zHead, zFoot, drop: 0.2, fold: 0.5 });
    return recentre(k.group());
  },
});

const headboardWall = item({
  id: 'headboard-wall-panel', category: 'bedroom', ko: '벽걸이 헤드보드', en: 'Wall-mounted headboard', placement: 'wall', elevation: 0.35, size: [1.8, 0.75, 0.07],
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.0, 2.6),
    P.len('height', '높이', 'Height', 0.75, 0.45, 1.2),
    P.pick('style', '패턴', 'Pattern', 'tiles', [['tiles', '사각 타일', 'Square tiles'], ['channels', '세로 채널', 'Vertical channels'], ['plain', '통판', 'Single pad']]),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-rose', 'fabric'),
    P.mat('board', '뒷판', 'Backing board', 'wood-oak', 'wood'),
  ],
  tags: ['headboard', 'wall headboard', 'padded panel', '헤드보드', '벽 헤드보드', '벽 패널', '쿠션 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.07, bt = 0.018;
    k.box('board', p.board, w, h, bt, 0, h / 2, -d / 2 + bt / 2, { r: 0.004 });
    const pd = d - bt - 0.001, pz = -d / 2 + bt + pd / 2 + 0.0005;
    let cols = 1, rows = 1;
    if (p.style === 'tiles') { cols = Math.max(2, Math.round(w / 0.45)); rows = Math.max(1, Math.round(h / 0.38)); }
    else if (p.style === 'channels') cols = Math.max(4, Math.round(w / 0.16));
    const cw = (w - 0.02) / cols, rh = (h - 0.02) / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) k.soft('pads', p.fabric, cw - 0.004, rh - 0.004, pd, Math.min(0.03, cw / 2.2, rh / 2.2), -w / 2 + 0.01 + cw * (i + 0.5), 0.01 + rh * (j + 0.5), pz, { puff: 0.012, flat: 3 });
    return k.group();
  },
});

/* ------------------------------------------------------- nightstands */

const nsFloating = item({
  id: 'nightstand-floating', category: 'bedroom', ko: '벽걸이 협탁', en: 'Floating nightstand', placement: 'wall', elevation: 0.42, size: [0.45, 0.2, 0.32],
  params: [
    P.len('width', '폭', 'Width', 0.45, 0.3, 0.7),
    P.mat('body', '몸체', 'Body', 'wood-walnut', 'wood'),
    P.mat('front', '전면', 'Front', 'wood-walnut', 'wood'),
    P.pick('handle', '손잡이', 'Handle', 'none', OPT.handle),
  ],
  tags: ['floating nightstand', 'wall nightstand', 'bedside shelf', '벽걸이 협탁', '플로팅 협탁', '침대 옆 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.2, d = 0.32, t = 0.018;
    k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.003 });
    k.box('body', p.body, w, t, d, 0, t / 2, 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('body', p.body, t, h - 2 * t, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.001 });
    k.box('body', p.body, w - 2 * t, h - 2 * t, 0.01, 0, h / 2, -d / 2 + 0.005, { r: 0 });
    // drawer above an open niche
    const dy = 0.085;
    k.box('body', p.body, w - 2 * t, 0.012, d - 0.03, 0, dy, 0, { r: 0.001 });
    k.box('fronts', p.front, w - 2 * t - 0.004, h - t - dy - 0.008, 0.016, 0, (h - t + dy) / 2, d / 2 - 0.008, { r: 0.002 });
    addHandle(k, 'handles', 'metal-brass', p.handle, 0, p.handle === 'edge' ? h - t - 0.012 : (h - t + dy) / 2, d / 2, { len: 0.12 });
    return k.group();
  },
});

const nsRound = item({
  id: 'nightstand-round-pedestal', category: 'bedroom', ko: '원형 페데스탈 협탁', en: 'Round pedestal nightstand', size: [0.46, 0.56, 0.46],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.46, 0.35, 0.6),
    P.len('height', '높이', 'Height', 0.56, 0.45, 0.7),
    P.mat('top', '상판', 'Top', 'marble-white', 'stone'),
    P.mat('wood', '받침', 'Base', 'wood-oak', 'wood'),
    P.bool('shelf', '중간 선반', 'Middle shelf', true),
  ],
  tags: ['round nightstand', 'pedestal table', 'side table', '원형 협탁', '사이드 테이블', '대리석 협탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, h = p.height;
    k.lathe('base', p.wood, [[0, 0], [R * 0.72, 0], [R * 0.74, 0.012], [R * 0.68, 0.03], [0.05, 0.05], [0, 0.05]], 0, 0, 0, { segs: k.seg(40, 10) });
    k.cyl('base', p.wood, 0.04, 0.05, h - 0.075, 0, 0.045, 0, { segs: k.seg(24, 8) });
    k.cyl('base', p.wood, R * 0.6, 0.042, 0.035, 0, h - 0.06, 0, { segs: k.seg(32, 8) });
    if (p.shelf) k.slab('base', p.wood, ellipse(R * 1.6, R * 1.6), 0.022, h * 0.42, { bevel: 0.005, curveSegs: 40 });
    k.slab('top', p.top, ellipse(2 * R, 2 * R), 0.025, h - 0.025, { bevel: 0.006, curveSegs: 48 });
    return k.group();
  },
});

const nsRattan = item({
  id: 'nightstand-rattan', category: 'bedroom', ko: '라탄 협탁', en: 'Rattan nightstand', size: [0.5, 0.58, 0.42],
  params: [
    P.len('width', '폭', 'Width', 0.5, 0.4, 0.65),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.mat('cane', '라탄', 'Cane', 'rattan', 'wood'),
  ],
  tags: ['rattan nightstand', 'cane nightstand', 'boho', '라탄 협탁', '등나무 협탁', '보헤미안'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.4, h = 0.58, legH = 0.18, t = 0.02, bh = h - legH;
    splayLegs(k, 'legs', p.wood, w - 0.02, d - 0.04, legH, { inset: 0.04, r: 0.017, rFoot: 0.011, splay: 0.015 });
    k.box('body', p.wood, w, 0.025, d, 0, h - 0.0125, 0, { r: 0.004, segs: 2 });
    k.box('body', p.wood, w - 2 * t, t, d - 0.01, 0, legH + t / 2, 0, { r: 0.002 });
    for (const s of [-1, 1]) {
      // cane side panels in a wood frame
      k.panel('body', p.wood, frameShape(d, bh - 0.025, 0.03, 0.03), t, s * (w / 2 - t / 2), legH + (bh - 0.025) / 2, 0, { ry: Math.PI / 2, bevel: 0.002 });
      k.box('cane', p.cane, 0.006, bh - 0.08, d - 0.055, s * (w / 2 - t / 2), legH + (bh - 0.025) / 2, 0, { r: 0 });
    }
    k.box('body', p.wood, w - 2 * t, bh - 0.025 - t, 0.01, 0, legH + t + (bh - 0.025 - t) / 2, -d / 2 + 0.005, { r: 0 });
    // top drawer with a cane panel, open shelf below
    const dh = 0.15, dy = h - 0.025 - dh / 2;
    k.box('body', p.wood, w - 2 * t, 0.016, d - 0.02, 0, h - 0.025 - dh - 0.008, 0, { r: 0.001 });
    k.panel('fronts', p.wood, frameShape(w - 2 * t - 0.004, dh - 0.006, 0.025, 0.025), 0.018, 0, dy, d / 2 - 0.009, { bevel: 0.002 });
    k.box('cane', p.cane, w - 2 * t - 0.05, dh - 0.05, 0.006, 0, dy, d / 2 - 0.012, { r: 0 });
    k.lathe('handles', p.wood, [[0, 0], [0.012, 0], [0.016, 0.014], [0.012, 0.022], [0, 0.024]], 0, dy, d / 2, { rx: Math.PI / 2, segs: k.seg(14, 6) });
    return k.group();
  },
});

const nsTier = item({
  id: 'nightstand-metal-two-tier', category: 'bedroom', ko: '2단 철제 협탁', en: 'Two-tier metal nightstand', size: [0.42, 0.64, 0.36],
  params: [
    P.len('width', '폭', 'Width', 0.42, 0.32, 0.6),
    P.len('height', '높이', 'Height', 0.6, 0.45, 0.7),
    P.mat('metal', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('wood', '선반', 'Shelves', 'wood-oak', 'wood'),
  ],
  tags: ['metal nightstand', 'two tier side table', 'industrial', '철제 협탁', '2단 협탁', '인더스트리얼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.36, h = p.height, r = 0.008;
    const xs = w / 2 - r, zs = d / 2 - r;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('frame', p.metal, r, r, h - 0.01, sx * xs, 0, sz * zs, { segs: k.seg(10, 5) });
    const shelf = (y) => {
      k.slab('shelves', p.wood, roundRect(w - 0.012, d - 0.012, 0.01), 0.018, y, { bevel: 0.003 });
      for (const sz of [-1, 1]) k.rod('frame', p.metal, [-xs, y - 0.006, sz * zs], [xs, y - 0.006, sz * zs], r * 0.8, { segs: k.seg(8, 4) });
      for (const sx of [-1, 1]) k.rod('frame', p.metal, [sx * xs, y - 0.006, -zs], [sx * xs, y - 0.006, zs], r * 0.8, { segs: k.seg(8, 4) });
    };
    shelf(0.16);
    shelf(h - 0.028);
    // gallery rail around the top shelf (back and sides)
    k.bentTube('frame', p.metal, [[-xs, h - 0.01, zs], [-xs, h + 0.03, zs - 0.02], [-xs, h + 0.03, -zs], [xs, h + 0.03, -zs], [xs, h + 0.03, zs - 0.02], [xs, h - 0.01, zs]], r * 0.7, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('frame', p.metal, r * 1.3, r * 1.3, 0.008, sx * xs, 0, sz * zs, { segs: k.seg(10, 5) });
    return k.group();
  },
});

const nsLamp = item({
  id: 'nightstand-with-lamp', category: 'bedroom', ko: '협탁+스탠드 세트', en: 'Nightstand with lamp', size: [0.46, 0.96, 0.41],
  params: [
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '전면', 'Front', 'wood-oak', 'wood'),
    P.mat('lampBase', '램프 받침', 'Lamp base', 'ceramic-terracotta', 'ceramic'),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
  ],
  tags: ['nightstand', 'bedside lamp', 'table lamp', '협탁', '수면등', '스탠드', '침대 옆 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.45, d = 0.38, h = 0.5;
    addCabinet(k, { w, h, d, rows: [{ h: 0.55, n: 1, type: 'open' }, { h: 0.45, n: 1, type: 'drawer' }], body: p.body, front: p.front, handle: 'knob', handleMat: 'metal-brass', base: 'plinth', plinth: 0.05, top: p.body, topThick: 0.02, topOverhang: 0.006 });
    // gourd lamp with a drum shade
    const y0 = h, lx = -0.03, lz = -0.03;
    k.lathe('lamp', p.lampBase, [[0, 0], [0.05, 0], [0.075, 0.04], [0.085, 0.09], [0.07, 0.15], [0.035, 0.2], [0.03, 0.24], [0.012, 0.25], [0, 0.25]], lx, y0, lz, { smooth: 16, segs: k.seg(28, 8) });
    k.cyl('lamp', 'metal-brass', 0.006, 0.006, 0.08, lx, y0 + 0.25, lz, { segs: k.seg(8, 4) });
    k.sphere('bulb', 'light-warm', 0.028, lx, y0 + 0.34, lz, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    k.lathe('shade', p.shade, [[0.16, 0], [0.155, 0.002], [0.13, 0.2], [0.125, 0.2]], lx, y0 + 0.26, lz, { segs: k.seg(36, 10) });
    k.light(lx, y0 + 0.34, lz, { intensity: 0.6, distance: 3 });
    return recentre(k.group());
  },
});

const nsCabinet = item({
  id: 'nightstand-cabinet', category: 'bedroom', ko: '도어형 협탁', en: 'Nightstand with door', size: [0.52, 0.62, 0.42],
  params: [
    P.len('width', '폭', 'Width', 0.5, 0.4, 0.65),
    P.mat('body', '몸체', 'Body', 'wood-walnut', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-walnut', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
  ],
  tags: ['nightstand', 'bedside cabinet', 'mid century', '협탁', '도어 협탁', '미드센추리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    addCabinet(k, { w: p.width, h: 0.62, d: 0.4, rows: [{ h: 0.66, n: 1, type: 'door' }, { h: 0.34, n: 1, type: 'drawer' }], body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-brass', base: 'plinth', plinth: 0.07, top: p.body, topThick: 0.025, topOverhang: 0.01 });
    return recentre(k.group());
  },
});

/* ------------------------------------------------------------ chests */

const chestGraduated = item({
  id: 'chest-graduated', category: 'bedroom', ko: '클래식 서랍장(점층)', en: 'Graduated chest of drawers', size: [0.93, 1.1, 0.51],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('height', '높이', 'Height', 1.1, 0.8, 1.4),
    P.int('rows', '단 수', 'Rows', 5, 3, 7),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle),
  ],
  tags: ['chest of drawers', 'tallboy', 'classic dresser', '서랍장', '5단 서랍장', '클래식 서랍장', '체스트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.48, H = p.height, footH = 0.07, band = 0.05, n = p.rows;
    // drawers get shallower towards the top; the top row is split in two
    const ws = Array.from({ length: n }, (_, i) => 1.18 ** (n - 1 - i));
    const sum = ws.reduce((a, b) => a + b, 0);
    const rows = ws.map((v, i) => ({ h: v / sum, n: i === n - 1 ? 2 : 1, type: 'drawer' }));
    addCabinet(k, { w, h: H - footH - band, d, y0: footH + band, rows, body: p.wood, front: p.wood, handle: p.handle, handleMat: 'metal-brass', base: 'none', top: p.wood, topThick: 0.03, topOverhang: 0.015 });
    k.box('body', p.wood, w + 0.02, band, d + 0.01, 0, footH + band / 2, 0.005, { r: 0.006, segs: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sphere('legs', p.wood, 0.042, sx * (w / 2 - 0.05), footH * 0.5, sz * (d / 2 - 0.05), { scale: [1, footH / 0.084 * 1.0, 1], segs: k.seg(16, 8), rings: k.seg(10, 5) });
    return recentre(k.group());
  },
});

const chestCampaign = item({
  id: 'chest-campaign', category: 'bedroom', ko: '캠페인 서랍장', en: 'Campaign chest', size: [1, 0.86, 0.46],
  params: [
    P.len('width', '폭', 'Width', 0.95, 0.7, 1.4),
    P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'),
    P.mat('brass', '금속 장식', 'Brass fittings', 'metal-brass', 'metal'),
  ],
  tags: ['campaign chest', 'brass corners', 'chest of drawers', '캠페인 서랍장', '서랍장', '황동 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, H = 0.86, footH = 0.06, b = p.brass;
    const rows = [{ h: 0.36, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.31, n: 2, type: 'drawer' }];
    addCabinet(k, { w, h: H - footH, d, y0: footH, rows, body: p.wood, front: p.wood, handle: 'none', base: 'none', top: p.wood, topThick: 0.025, topOverhang: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', p.wood, 0.05, footH, 0.05, sx * (w / 2 - 0.03), footH / 2, sz * (d / 2 - 0.03), { r: 0.004 });
    // inset brass pulls: plate + bail
    const bodyH = H - footH - 0.025;
    let y = footH;
    for (const row of rows) {
      const rh = row.h * bodyH;
      for (let c = 0; c < row.n; c++) {
        const cx = -w / 2 + (w / row.n) * (c + 0.5), cy = y + rh / 2;
        k.box('brass', b, 0.1, 0.045, 0.004, cx, cy, d / 2 + 0.002, { r: 0.002 });
        const pts = [];
        for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); pts.push([cx - 0.035 * Math.cos(a), cy - 0.005 - 0.022 * Math.sin(a), d / 2 + 0.008]); }
        k.tube('brass', b, pts, 0.003, { segs: k.seg(16, 6), radial: k.seg(6, 4) });
      }
      y += rh;
    }
    // L-shaped corner brackets on the front and sides
    for (const sx of [-1, 1]) for (const yy of [footH + 0.03, H - 0.04]) {
      k.box('brass', b, 0.05, 0.05, 0.003, sx * (w / 2 - 0.025), yy, d / 2 + 0.0015, { r: 0.001 });
      k.box('brass', b, 0.003, 0.05, 0.05, sx * (w / 2 + 0.0015), yy, d / 2 - 0.025, { r: 0.001 });
    }
    // carry handles on the sides
    for (const sx of [-1, 1]) {
      k.box('brass', b, 0.004, 0.05, 0.12, sx * (w / 2 + 0.002), H * 0.55, 0, { r: 0.001 });
      k.bentTube('brass', b, [[sx * (w / 2 + 0.004), H * 0.55 + 0.01, -0.05], [sx * (w / 2 + 0.02), H * 0.55 + 0.01, -0.05], [sx * (w / 2 + 0.02), H * 0.55 + 0.01, 0.05], [sx * (w / 2 + 0.004), H * 0.55 + 0.01, 0.05]], 0.004, 0.01);
    }
    return recentre(k.group());
  },
});

const dresserMirror = item({
  id: 'dresser-with-mirror', category: 'bedroom', ko: '거울 서랍장', en: 'Dresser with mirror', size: [1.22, 1.63, 0.49],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.9, 1.6),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle),
  ],
  tags: ['dresser with mirror', 'dressing chest', 'mirror dresser', '거울 서랍장', '화장 서랍장', '서랍장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.46, h = 0.8;
    const rows = [0, 1, 2].map(() => ({ h: 1 / 3, n: 2, type: 'drawer' }));
    const { top } = addCabinet(k, { w, h, d, rows, body: p.wood, front: p.front, handle: p.handle, handleMat: 'metal-brass', base: 'plinth', plinth: 0.07, top: p.wood, topThick: 0.025, topOverhang: 0.01 });
    // landscape mirror on two uprights at the back
    const mw = Math.min(1.0, w * 0.78), mh = 0.68, my = top + 0.13, mz = -d / 2 + 0.05;
    for (const s of [-1, 1]) k.box('frame', p.wood, 0.04, mh + 0.13 + 0.02, 0.03, s * (mw / 2 + 0.02), top + (mh + 0.15) / 2, mz, { r: 0.004 });
    k.panel('frame', p.wood, frameShape(mw, mh, 0.045, 0.045, 0.006), 0.025, 0, my + mh / 2, mz, { bevel: 0.004 });
    k.box('mirror', 'mirror', mw - 0.08, mh - 0.08, 0.004, 0, my + mh / 2, mz - 0.004, { r: 0 });
    return recentre(k.group());
  },
});

const blanketChest = item({
  id: 'chest-blanket-trunk', category: 'bedroom', ko: '침대 끝 트렁크', en: 'Blanket chest trunk', size: [1.07, 0.5, 0.48],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('strap', '스트랩', 'Straps', 'leather-cognac', 'leather'),
    P.mat('metal', '금속', 'Hardware', 'metal-brass', 'metal'),
  ],
  tags: ['blanket chest', 'trunk', 'storage chest', '트렁크', '수납함', '침대 끝 수납', '블랭킷 체스트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.46, h = 0.5, lid = 0.07, plinth = 0.06;
    k.box('body', p.wood, w + 0.02, plinth, d + 0.02, 0, plinth / 2, 0, { r: 0.006, segs: 2 });
    k.box('body', p.wood, w, h - plinth - lid - 0.004, d, 0, plinth + (h - plinth - lid - 0.004) / 2, 0, { r: 0.004 });
    k.box('body', p.wood, w + 0.012, lid, d + 0.012, 0, h - lid / 2, 0, { r: 0.012, segs: 2 });
    // two leather straps over the lid and down the front
    for (const s of [-1, 1]) {
      const x = s * w * 0.28;
      k.box('straps', p.strap, 0.05, 0.004, d + 0.014, x, h + 0.002, 0, { r: 0.001 });
      k.box('straps', p.strap, 0.05, h - plinth - 0.02, 0.004, x, plinth + 0.01 + (h - plinth - 0.02) / 2, d / 2 + 0.008, { r: 0.001 });
      k.box('hardware', p.metal, 0.06, 0.03, 0.006, x, h * 0.58, d / 2 + 0.012, { r: 0.002 });
    }
    k.box('hardware', p.metal, 0.06, 0.07, 0.005, 0, h - lid - 0.02, d / 2 + 0.003, { r: 0.002 });
    for (const sx of [-1, 1]) k.bentTube('hardware', p.metal, [[sx * (w / 2), h * 0.62, -0.07], [sx * (w / 2 + 0.03), h * 0.62, -0.07], [sx * (w / 2 + 0.03), h * 0.62, 0.07], [sx * (w / 2), h * 0.62, 0.07]], 0.006, 0.012);
    return k.group();
  },
});

/* --------------------------------------------------------- wardrobes */

const armoire = item({
  id: 'armoire-classic', category: 'bedroom', ko: '클래식 아르무아르', en: 'Classic armoire', size: [1.2, 2.1, 0.69],
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.9, 1.6),
    P.len('height', '높이', 'Height', 2.1, 1.8, 2.4),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('knobs', '손잡이', 'Knobs', 'metal-brass', 'metal'),
  ],
  tags: ['armoire', 'wardrobe', 'classic wardrobe', '아르무아르', '옷장', '클래식 옷장', '앤틱 옷장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = p.height, d = 0.58, m = p.wood;
    const footH = 0.08, baseH = 0.1, crown = 0.12, ft = 0.022;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sphere('body', m, 0.045, sx * (w / 2 - 0.04), footH / 2, sz * (d / 2 - 0.05), { scale: [1, footH / 0.09, 1], segs: k.seg(14, 6), rings: k.seg(8, 4) });
    k.box('body', m, w + 0.03, baseH, d + 0.03, 0, footH + baseH / 2, 0, { r: 0.008, segs: 2 });
    const y0 = footH + baseH, bodyH = H - y0 - crown;
    k.box('body', m, w, bodyH, d - ft, 0, y0 + bodyH / 2, -ft / 2, { r: 0.003 });
    // stepped crown
    [[w + 0.02, 0.03], [w + 0.06, 0.04], [w + 0.1, 0.05]].reduce((y, [cw, ch]) => { k.box('body', m, cw, ch, d + (cw - w), 0, y + ch / 2, (cw - w) / 2 - 0.01, { r: 0.006, segs: 2 }); return y + ch; }, y0 + bodyH);
    // a drawer at the bottom, two panelled doors above
    const drH = 0.22, fz = d / 2 - ft / 2;
    k.box('fronts', m, w - 0.006, drH - 0.006, ft, 0, y0 + drH / 2, fz, { r: 0.003 });
    for (const s of [-1, 1]) k.sphere('knobs', p.knobs, 0.016, s * w * 0.25, y0 + drH / 2, fz + ft / 2 + 0.012, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const dy = y0 + drH, dh = bodyH - drH, dw = w / 2;
    for (const s of [-1, 1]) {
      const cx = s * dw / 2;
      k.box('fronts', m, dw - 0.006, dh - 0.006, ft, cx, dy + dh / 2, fz, { r: 0.003 });
      const ph1 = dh * 0.62 - 0.1, ph2 = dh * 0.38 - 0.1;
      k.panel('fronts', m, frameShape(dw - 0.12, ph1, 0.035, 0.035, 0.01), 0.012, cx, dy + dh - 0.06 - ph1 / 2, fz + ft / 2 + 0.005, { bevel: 0.003 });
      k.panel('fronts', m, frameShape(dw - 0.12, ph2, 0.035, 0.035, 0.01), 0.012, cx, dy + 0.06 + ph2 / 2, fz + ft / 2 + 0.005, { bevel: 0.003 });
      k.sphere('knobs', p.knobs, 0.016, -s * 0.04 + 0, dy + dh * 0.45, fz + ft / 2 + 0.012, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    }
    return recentre(k.group());
  },
});

/** A shirt / dress on a hanger hooked onto a rail along x at (yRail, zRail). Garment plane = y/z. */
function garment(k, mat, x, yRail, zRail, { len = 0.75, w = 0.44, flare = 0, seed = 1 } = {}) {
  const hy = yRail - 0.06;
  k.tube('hangers', 'wood-oak', [[x, hy - 0.035, zRail - w / 2 + 0.02], [x, hy - 0.006, zRail - 0.08], [x, hy, zRail], [x, hy - 0.006, zRail + 0.08], [x, hy - 0.035, zRail + w / 2 - 0.02]], 0.007, { segs: k.seg(16, 6), radial: k.seg(6, 4) });
  k.tube('hooks', 'metal-chrome', [[x, hy, zRail], [x, yRail + 0.004, zRail - 0.006], [x, yRail + 0.022, zRail + 0.004], [x, yRail + 0.006, zRail + 0.02]], 0.0025, { segs: k.seg(10, 4), radial: 4 });
  const rand = rng(seed), ph = rand() * 6;
  const g = shellGeo(k.seg(10, 4), k.seg(14, 5), (u, v) => {
    const s = u * 2 - 1;
    const sh = Math.min(1, v / 0.08);
    const hw = (w / 2) * (0.25 + 0.75 * Math.sqrt(sh)) * (1 + flare * v * v);
    const y = hy - 0.02 - 0.045 * Math.abs(s) * (1 - v) - v * len;
    const bulge = 0.018 * (1 - s * s) * Math.sin(Math.PI * Math.min(1, v * 1.1)) + 0.006 * Math.sin(s * 5 + ph + v * 4) * v;
    return [x + bulge, y, zRail + s * hw];
  }, 0.012);
  k.add('clothes', mat, g);
}
const CLOTH_MATS = ['fabric-navy', 'fabric-cotton-white', 'fabric-mustard', 'fabric-linen-beige', 'fabric-terracotta', 'fabric-cotton-grey'];

const clothesRail = item({
  id: 'clothes-rail-open', category: 'bedroom', ko: '오픈 행거', en: 'Open clothes rail', size: [1.2, 1.61, 0.53],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.int('clothes', '옷 수', 'Garments', 6, 0, 12),
    P.mat('metal', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('wood', '하부 선반', 'Bottom shelf', 'wood-oak', 'wood'),
  ],
  tags: ['clothes rail', 'garment rack', 'open wardrobe', '행거', '옷걸이', '오픈 옷장', '드레스룸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = 1.6, d = 0.44, r = 0.014, m = p.metal;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - r);
      k.box('frame', m, 0.03, 0.03, d, x, 0.015, 0, { r: 0.004 });
      k.cyl('frame', m, r, r, H - 0.03, x, 0.03, 0, { segs: k.seg(12, 6) });
    }
    k.rod('frame', m, [-w / 2, H - 0.01, 0], [w / 2, H - 0.01, 0], r, { segs: k.seg(12, 6) });
    k.box('shelf', p.wood, w - 0.05, 0.022, d - 0.04, 0, 0.2, 0, { r: 0.004 });
    for (const sz of [-1, 1]) k.rod('frame', m, [-w / 2 + r, 0.18, sz * (d / 2 - 0.03)], [w / 2 - r, 0.18, sz * (d / 2 - 0.03)], 0.007, { segs: k.seg(8, 4) });
    const n = p.clothes, span = w - 0.16;
    for (let i = 0; i < n; i++) garment(k, CLOTH_MATS[i % CLOTH_MATS.length], -span / 2 + (n > 1 ? (span * i) / (n - 1) : span / 2), H - 0.01, 0, { len: 0.62 + (i % 3) * 0.14, w: 0.42, flare: i % 4 === 2 ? 0.25 : 0, seed: i + 1 });
    // a pair of boxes on the shelf
    k.box('boxes', 'paper', 0.32, 0.12, 0.26, -w / 4, 0.211 + 0.06, 0, { r: 0.004 });
    k.box('boxes', 'paper', 0.28, 0.1, 0.24, -w / 4 + 0.01, 0.211 + 0.17, 0, { r: 0.004 });
    return k.group();
  },
});

const mirrorSliding = item({
  id: 'wardrobe-mirror-sliding', category: 'bedroom', ko: '거울 슬라이딩 옷장', en: 'Mirrored sliding wardrobe', size: [1.8, 2.2, 0.62],
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.2, 3.0),
    P.len('height', '높이', 'Height', 2.2, 1.9, 2.5),
    P.int('doors', '문 수', 'Doors', 2, 2, 4),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('frame', '문틀', 'Door frames', 'metal-aluminium', 'metal'),
  ],
  tags: ['mirror wardrobe', 'sliding wardrobe', 'mirrored closet', '거울 옷장', '슬라이딩 옷장', '붙박이장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.62, plinth = 0.06, top = 0.05;
    const bh = h - plinth;
    k.box('body', p.body, w, bh, d - 0.07, 0, plinth + bh / 2, -0.035, { r: 0.003 });
    k.box('body', p.body, w - 0.02, plinth, d - 0.1, 0, plinth / 2, -0.04, { r: 0.001 });
    for (const s of [-1, 1]) k.box('body', p.body, 0.02, bh, 0.07, s * (w / 2 - 0.01), plinth + bh / 2, d / 2 - 0.035, { r: 0.002 });
    k.box('body', p.body, w, top, 0.07, 0, h - top / 2, d / 2 - 0.035, { r: 0.002 });
    k.box('track', p.frame, w - 0.04, 0.012, 0.06, 0, h - top - 0.006, d / 2 - 0.035, { r: 0.001 });
    k.box('track', p.frame, w - 0.04, 0.008, 0.06, 0, plinth + 0.004, d / 2 - 0.035, { r: 0.001 });
    const n = p.doors, pw = (w - 0.04) / n + 0.03, ph = h - plinth - top - 0.026;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.02 + ((w - 0.04 - pw) * i) / (n - 1) + pw / 2;
      const z = d / 2 - (i % 2 === 0 ? 0.017 : 0.047);
      k.panel('frames', p.frame, frameShape(pw, ph, 0.025, 0.03), 0.022, x, plinth + 0.013 + ph / 2, z, { bevel: 0.002 });
      k.box('mirror', 'mirror', pw - 0.044, ph - 0.054, 0.005, x, plinth + 0.013 + ph / 2, z, { r: 0 });
    }
    return k.group();
  },
});

const closetModule = item({
  id: 'closet-walk-in-module', category: 'bedroom', ko: '드레스룸 모듈', en: 'Walk-in closet module', size: [1, 2.2, 0.57],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.2),
    P.pick('layout', '구성', 'Layout', 'mixed', [['hang', '긴 옷 행거', 'Long hanging'], ['mixed', '행거+선반', 'Rail + shelves'], ['shelves', '선반+서랍', 'Shelves + drawers']]),
    P.mat('body', '몸체', 'Body', 'wood-oak', 'wood'),
    P.mat('front', '서랍 전면', 'Drawer fronts', 'wood-white', 'wood'),
    P.bool('clothes', '옷 표시', 'Show clothes', true),
  ],
  tags: ['walk in closet', 'closet system', 'dressing room', '드레스룸', '시스템 옷장', '옷장 모듈', '드레스룸 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = 2.2, d = 0.55, t = 0.02, m = p.body, iw = w - 2 * t;
    for (const s of [-1, 1]) k.box('body', m, t, H, d, s * (w / 2 - t / 2), H / 2, 0, { r: 0.002 });
    k.box('body', m, iw, t, d, 0, H - t / 2, 0, { r: 0.002 });
    k.box('body', m, iw, 0.08, d - 0.02, 0, 0.04, -0.01, { r: 0.002 });
    k.box('body', m, iw, H - 0.08 - t, 0.01, 0, 0.08 + (H - 0.08 - t) / 2, -d / 2 + 0.005, { r: 0 });
    const shelf = (y) => k.box('body', m, iw, t, d - 0.02, 0, y, 0.0, { r: 0.002 });
    const rail = (y) => k.rod('rail', 'metal-chrome', [-iw / 2, y, 0], [iw / 2, y, 0], 0.012, { segs: k.seg(12, 6) });
    const folded = (y, n) => {
      if (!p.clothes) return;
      const cols = Math.max(1, Math.round(iw / 0.34));
      for (let c = 0; c < cols; c++) for (let j = 0; j < n; j++) {
        const fx = -iw / 2 + (iw / cols) * (c + 0.5);
        k.soft('clothes', CLOTH_MATS[(c * 3 + j) % CLOTH_MATS.length], Math.min(0.3, iw / cols - 0.04), 0.04, 0.3, 0.015, fx, y + 0.02 + j * 0.041, 0.02, { puff: 0.004, flat: 2 });
      }
    };
    const hangs = (yRail, len, cnt) => { if (p.clothes) for (let i = 0; i < cnt; i++) garment(k, CLOTH_MATS[(i * 2 + 1) % CLOTH_MATS.length], -iw / 2 + 0.08 + ((iw - 0.16) * i) / Math.max(1, cnt - 1), yRail, 0, { len, w: 0.42, seed: i + 3 }); };
    const nh = Math.max(2, Math.round(iw / 0.16));
    if (p.layout === 'hang') {
      shelf(1.85); rail(1.78); folded(1.86, 4); hangs(1.78, 1.25, nh);
    } else if (p.layout === 'mixed') {
      shelf(1.88); rail(1.8); folded(1.89, 4); hangs(1.8, 0.72, nh);
      shelf(0.95); shelf(0.62); folded(0.96, 2); folded(0.63, 3);
      const fronts = [[0.08, 0.27], [0.35, 0.27]];
      for (const [y, h] of fronts) { k.box('fronts', p.front, iw - 0.004, h - 0.004, 0.018, 0, y + h / 2, d / 2 - 0.009, { r: 0.002 }); addHandle(k, 'handles', 'metal-black', 'edge', 0, y + h - 0.012, d / 2, { len: 0.2 }); }
    } else {
      for (const y of [0.78, 1.12, 1.46, 1.8]) { shelf(y); folded(y + t / 2, 3); }
      for (let i = 0; i < 3; i++) { const y = 0.08 + i * 0.23, h = 0.23; k.box('fronts', p.front, iw - 0.004, h - 0.004, 0.018, 0, y + h / 2, d / 2 - 0.009, { r: 0.002 }); addHandle(k, 'handles', 'metal-black', 'edge', 0, y + h - 0.012, d / 2, { len: 0.2 }); }
    }
    return recentre(k.group());
  },
});

const jewelArmoire = item({
  id: 'jewellery-armoire', category: 'bedroom', ko: '보석 수납장(거울)', en: 'Jewellery armoire', size: [0.41, 1.05, 0.32],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-dark', 'wood'),
    P.mat('knobs', '손잡이', 'Knobs', 'metal-gold', 'metal'),
  ],
  tags: ['jewellery armoire', 'jewelry cabinet', 'mirror cabinet', '보석함', '쥬얼리 수납장', '거울 수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.4, d = 0.3, H = 1.05, legH = 0.28, m = p.wood;
    splayLegs(k, 'legs', m, w, d, legH, { inset: 0.03, r: 0.014, rFoot: 0.009, splay: 0.02, square: false });
    const bodyH = H - legH - 0.03, ft = 0.018;
    k.box('body', m, w, bodyH, d - ft, 0, legH + bodyH / 2, -ft / 2, { r: 0.003 });
    // three small drawers below a full mirror door, hinged lid on top
    const dh = 0.075;
    for (let i = 0; i < 3; i++) {
      const y = legH + dh * (i + 0.5);
      k.box('fronts', m, w - 0.006, dh - 0.005, ft, 0, y, d / 2 - ft / 2, { r: 0.002 });
      k.sphere('knobs', p.knobs, 0.01, 0, y, d / 2 + 0.008, { segs: k.seg(10, 6), rings: k.seg(6, 4) });
    }
    const doorY = legH + 3 * dh, doorH = bodyH - 3 * dh;
    k.panel('fronts', m, frameShape(w - 0.006, doorH - 0.006, 0.035, 0.035), ft, 0, doorY + doorH / 2, d / 2 - ft / 2, { bevel: 0.002 });
    k.box('mirror', 'mirror', w - 0.07, doorH - 0.075, 0.004, 0, doorY + doorH / 2, d / 2 - ft / 2, { r: 0 });
    k.sphere('knobs', p.knobs, 0.01, w / 2 - 0.02, doorY + doorH / 2, d / 2 + 0.008, { segs: k.seg(10, 6), rings: k.seg(6, 4) });
    k.box('body', m, w + 0.012, 0.03, d + 0.008, 0, H - 0.015, 0.002, { r: 0.006, segs: 2 });
    return recentre(k.group());
  },
});

/* --------------------------------------------------- vanity & mirrors */

const hollywood = item({
  id: 'vanity-hollywood', category: 'bedroom', ko: '할리우드 조명 화장대', en: 'Hollywood vanity with lights', size: [1.1, 1.5, 0.49],
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.8, 1.4),
    P.mat('body', '몸체', 'Body', 'paint-white-gloss', 'paint'),
    P.mat('top', '상판', 'Top', 'marble-white', 'stone'),
    P.mat('handles', '손잡이', 'Handles', 'metal-gold', 'metal'),
  ],
  tags: ['hollywood vanity', 'makeup vanity', 'lighted mirror', '할리우드 화장대', '조명 거울', '화장대', '메이크업'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, h = 0.76, m = p.body;
    k.box('top', p.top, w, 0.025, d, 0, h - 0.0125, 0, { r: 0.004 });
    // two drawer pedestals with a knee space between
    const pw = Math.min(0.36, w * 0.3), ph = h - 0.025 - 0.06;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - pw / 2);
      k.box('body', m, pw, ph, d - 0.02, x, 0.06 + ph / 2, -0.01, { r: 0.003 });
      k.box('body', m, pw - 0.04, 0.06, d - 0.08, x, 0.03, -0.02, { r: 0.002 });
      for (let i = 0; i < 3; i++) {
        const dh = ph / 3, y = 0.06 + dh * (i + 0.5);
        k.box('fronts', m, pw - 0.006, dh - 0.005, 0.018, x, y, d / 2 - 0.009, { r: 0.002 });
        addHandle(k, 'handles', p.handles, 'bar', x, y, d / 2, { len: 0.12 });
      }
    }
    k.box('body', m, w - 2 * pw, 0.1, d - 0.04, 0, h - 0.025 - 0.05, -0.02, { r: 0.002 });
    k.box('fronts', m, w - 2 * pw - 0.006, 0.094, 0.018, 0, h - 0.075, d / 2 - 0.009, { r: 0.002 });
    // mirror with bulbs around three sides
    const mw = Math.min(0.9, w * 0.8), mh = 0.68, my = h + 0.06, mz = -d / 2 + 0.05;
    k.panel('frame', m, frameShape(mw, mh, 0.08, 0.08, 0.01), 0.035, 0, my + mh / 2, mz, { bevel: 0.004 });
    k.box('mirror', 'mirror', mw - 0.15, mh - 0.15, 0.004, 0, my + mh / 2, mz - 0.006, { r: 0 });
    k.box('frame', m, mw * 0.5, 0.06, 0.12, 0, h + 0.03, mz + 0.01, { r: 0.004 });
    const bz = mz + 0.0175 + 0.014;
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.sphere('bulbs', 'light-warm', 0.019, s * (mw / 2 - 0.04), my + 0.08 + (i * (mh - 0.16)) / 3, bz, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    for (let i = 0; i < 3; i++) k.sphere('bulbs', 'light-warm', 0.019, -mw / 4 + (i * mw) / 4, my + mh - 0.04, bz, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    for (const s of [-1, 1]) k.light(s * (mw / 2 - 0.04), my + mh / 2, bz + 0.05, { intensity: 0.4, distance: 2.5 });
    return recentre(k.group());
  },
});

const vanityStool = item({
  id: 'vanity-stool-round', category: 'bedroom', ko: '화장대 의자(원형)', en: 'Round vanity stool', size: [0.4, 0.47, 0.4],
  params: [
    P.mat('fabric', '쿠션', 'Cushion', 'fabric-velvet-rose', 'fabric'),
    P.mat('metal', '다리', 'Legs', 'metal-gold', 'metal'),
    P.bool('skirt', '주름 스커트', 'Pleated skirt', false),
  ],
  tags: ['vanity stool', 'round stool', 'dressing stool', '화장대 의자', '스툴', '원형 스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.19, sy = 0.38, H = 0.47;
    k.lathe('seat', p.fabric, [[0, sy], [R * 0.96, sy], [R + 0.004, sy + 0.012], [R + 0.01, sy + 0.045], [R - 0.004, sy + 0.08], [R * 0.7, H - 0.002], [0, H]], 0, 0, 0, { smooth: 18, segs: k.seg(40, 10) });
    if (p.skirt) {
      const g = shellGeo(k.seg(72, 24), k.seg(6, 3), (u, v) => {
        const a = u * Math.PI * 2, rr = R + 0.012 + 0.008 * Math.sin(a * 24) * (0.4 + v);
        return [rr * Math.cos(a) * (1 + 0.04 * v), sy + 0.02 - v * (sy + 0.01), -rr * Math.sin(a) * (1 + 0.04 * v)];
      }, 0.003);
      k.add('seat', p.fabric, g);
    } else {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
        k.rod('legs', p.metal, [c * (R + 0.01), 0, s * (R + 0.01)], [c * R * 0.7, sy + 0.005, s * R * 0.7], 0.009, { segs: k.seg(10, 5) });
      }
      const ring = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([Math.cos(a) * (R * 0.89), 0.14, Math.sin(a) * (R * 0.89)]); }
      k.tube('legs', p.metal, ring, 0.005, { closed: true, segs: k.seg(48, 16), radial: k.seg(6, 4) });
    }
    return k.group();
  },
});

const cheval = item({
  id: 'mirror-cheval', category: 'bedroom', ko: '전신 스탠드 거울(체벌)', en: 'Cheval floor mirror', size: [0.66, 1.65, 0.48],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.pick('shape', '모양', 'Shape', 'oval', [['oval', '타원', 'Oval'], ['rect', '사각', 'Rectangle']]),
    P.num('tilt', '기울기(°)', 'Tilt (°)', 6, 0, 15, 1),
  ],
  tags: ['cheval mirror', 'floor mirror', 'full length mirror', '전신 거울', '스탠드 거울', '체벌 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.wood, mw = 0.5, mh = 1.25, px = mw / 2 + 0.05, pivot = 0.95;
    for (const s of [-1, 1]) {
      k.box('stand', m, 0.05, 0.045, 0.48, s * px, 0.0225, 0, { r: 0.008, segs: 2 });
      k.box('stand', m, 0.04, 1.55, 0.04, s * px, 0.045 + 1.55 / 2, 0, { r: 0.005, segs: 2 });
      k.sphere('stand', m, 0.028, s * px, 1.6 + 0.02, 0, { segs: k.seg(14, 6), rings: k.seg(8, 4) });
      k.cyl('stand', 'metal-brass', 0.018, 0.018, 0.02, s * (px - 0.02), pivot, 0, { rz: Math.PI / 2 * s, segs: k.seg(14, 6) });
    }
    k.box('stand', m, 2 * px, 0.035, 0.035, 0, 0.18, 0, { r: 0.004 });
    const a = -(p.tilt * Math.PI) / 180;
    const outer = p.shape === 'oval' ? ellipse(mw, mh) : roundRect(mw, mh, 0.03);
    const inner = p.shape === 'oval' ? ellipse(mw - 0.07, mh - 0.07) : roundRect(mw - 0.07, mh - 0.07, 0.015);
    const ip = p.shape === 'oval' ? ellipse(mw - 0.06, mh - 0.06) : roundRect(mw - 0.06, mh - 0.06, 0.015);
    k.panel('frame', m, ringShape(outer, inner), 0.03, 0, pivot, 0, { rx: a, bevel: 0.006, curveSegs: 48 });
    k.panel('mirror', 'mirror', ip, 0.006, 0, pivot, -0.004, { rx: a, bevel: 0.001, curveSegs: 48 });
    return recentre(k.group());
  },
});

const leaningArch = item({
  id: 'mirror-floor-arched', category: 'bedroom', ko: '아치형 전신 거울', en: 'Arched leaning floor mirror', size: [0.7, 1.79, 0.22],
  params: [
    P.len('width', '폭', 'Width', 0.7, 0.45, 1.0),
    P.len('height', '높이', 'Height', 1.8, 1.4, 2.0),
    P.mat('frame', '프레임', 'Frame', 'metal-gold', 'metal'),
  ],
  tags: ['arched mirror', 'leaning mirror', 'floor mirror', '아치 거울', '전신 거울', '기대는 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = p.height, a = -0.1, fw = 0.03;
    k.panel('frame', p.frame, ringShape(topRound(w, H, w / 2), topRound(w - 2 * fw, H - 2 * fw, w / 2 - fw, fw)), 0.028, 0, 0, 0, { rx: a, bevel: 0.004, curveSegs: 40 });
    k.panel('mirror', 'mirror', topRound(w - 2 * fw + 0.01, H - 2 * fw + 0.01, w / 2 - fw + 0.005, fw - 0.005), 0.005, 0, 0, -0.008, { rx: a, bevel: 0.001, curveSegs: 40 });
    k.box('frame', 'rubber-black', w - 0.1, 0.012, 0.03, 0, 0.006, 0.01, { r: 0.003 });
    return recentre(k.group());
  },
});

/* ----------------------------------------------------- accessories */

const valet = item({
  id: 'valet-stand', category: 'bedroom', ko: '양복 걸이(발렛 스탠드)', en: 'Clothes valet stand', size: [0.48, 1.09, 0.34],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['valet stand', 'suit stand', 'clothes stand', '양복걸이', '발렛 스탠드', '옷걸이 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.wood;
    k.box('frame', m, 0.4, 0.03, 0.34, 0, 0.015, 0, { r: 0.008, segs: 2 });
    k.box('frame', m, 0.04, 0.98, 0.04, 0, 0.03 + 0.49, -0.04, { r: 0.006, segs: 2 });
    // shoulder hanger
    k.tube('frame', m, [[-0.22, 1.0, -0.04], [-0.12, 1.055, -0.04], [0, 1.07, -0.04], [0.12, 1.055, -0.04], [0.22, 1.0, -0.04]], 0.018, { segs: k.seg(28, 8), radial: k.seg(10, 5), caps: true });
    // trouser bar on two arms + small valet tray
    for (const s of [-1, 1]) k.box('frame', m, 0.025, 0.025, 0.14, s * 0.16, 0.72, 0.02, { r: 0.004 });
    k.box('frame', m, 0.18 * 2 + 0.02, 0.03, 0.025, 0, 0.72, 0.08, { r: 0.008 });
    k.box('frame', m, 0.32, 0.025, 0.02, 0, 0.72, -0.04, { r: 0.004 });
    k.box('tray', m, 0.26, 0.012, 0.16, 0, 0.45, 0.06, { r: 0.004 });
    for (const [w, d, x, z] of [[0.26, 0.008, 0, 0.14], [0.26, 0.008, 0, -0.02], [0.008, 0.16, -0.126, 0.06], [0.008, 0.16, 0.126, 0.06]]) k.box('tray', m, w, 0.03, d, x, 0.465, z, { r: 0.002 });
    k.cyl('metal', p.metal, 0.012, 0.012, 0.03, 0, 1.0, -0.04, { segs: k.seg(12, 6) });
    return recentre(k.group());
  },
});

/** A cloth hung over a horizontal rod (x axis) at (yc, zc): front part `front` long, back part `back` long. */
function hungCloth(w, yc, zc, r, front, back, thick, nu, nv, seed) {
  const L = front + Math.PI * r + back;
  const rand = rng(seed), ph = rand() * 6;
  return shellGeo(nu, nv, (u, v) => {
    const x = (u - 0.5) * w;
    const s = v * L - front;
    let y, z;
    if (s < 0) { y = yc + s; z = zc + r; }
    else if (s <= Math.PI * r) { const a = s / r; y = yc + r * Math.sin(a); z = zc + r * Math.cos(a); }
    else { y = yc - (s - Math.PI * r); z = zc - r; }
    const hang = Math.max(0, yc - y) / Math.max(front, back);
    const sz = z > zc ? 1 : -1;
    z += sz * 0.012 * hang * (0.5 + 0.5 * Math.sin(x * 22 + ph));
    return [x, y, z];
  }, thick);
}

const blanketLadder = item({
  id: 'blanket-ladder', category: 'bedroom', ko: '담요 사다리', en: 'Blanket ladder', size: [0.5, 1.71, 0.34],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.int('blankets', '담요 수', 'Blankets', 2, 0, 3),
    P.mat('fabric1', '담요 1', 'Blanket 1', 'fabric-wool-charcoal', 'fabric'),
    P.mat('fabric2', '담요 2', 'Blanket 2', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['blanket ladder', 'throw ladder', 'towel ladder', '담요 사다리', '사다리 선반', '블랭킷 래더'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 1.7, lean = 0.3, w = 0.5, m = p.wood;
    const zAt = (y) => lean / 2 - (y / H) * lean;
    for (const s of [-1, 1]) k.rod('frame', m, [s * (w / 2 - 0.02), 0, zAt(0)], [s * (w / 2 - 0.02), H, zAt(H)], 0.02, { segs: k.seg(14, 6) });
    const rungs = [0.3, 0.62, 0.94, 1.26, 1.56];
    for (const y of rungs) k.rod('frame', m, [-w / 2 + 0.02, y, zAt(y)], [w / 2 - 0.02, y, zAt(y)], 0.013, { segs: k.seg(12, 6) });
    const mats = [p.fabric1, p.fabric2, p.fabric1];
    const use = [3, 1, 4];
    for (let i = 0; i < p.blankets; i++) {
      const y = rungs[use[i]], z = zAt(y);
      const g = hungCloth(w - 0.1 - i * 0.02, y, z, 0.013 + 0.008, 0.18 + i * 0.03, 0.42 + i * 0.12, 0.008, k.seg(16, 6), k.seg(36, 12), i + 2);
      k.add('blankets', mats[i], g);
    }
    return recentre(k.group());
  },
});

const luggageRack = item({
  id: 'luggage-rack', category: 'bedroom', ko: '여행가방 거치대', en: 'Luggage rack', size: [0.68, 0.77, 0.46],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.mat('strap', '스트랩', 'Straps', 'leather-brown', 'leather'),
    P.bool('suitcase', '여행가방', 'Suitcase', true),
    P.mat('case', '가방', 'Suitcase', 'leather-cognac', 'leather'),
  ],
  tags: ['luggage rack', 'suitcase stand', 'hotel', '러기지 랙', '여행가방 거치대', '호텔 가구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.62, h = 0.52, zs = 0.2, m = p.wood;
    // folding X legs on both ends
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.02);
      k.rod('frame', m, [x, 0.012, -zs], [x, h, zs], 0.016, { segs: k.seg(12, 6) });
      k.rod('frame', m, [x + s * 0.025, 0.012, zs], [x + s * 0.025, h, -zs], 0.016, { segs: k.seg(12, 6) });
      k.cyl('metal', 'metal-brass', 0.012, 0.012, 0.045, x - s * 0.01, h / 2, 0, { rz: Math.PI / 2, segs: k.seg(10, 5) });
    }
    for (const sz of [-1, 1]) k.rod('frame', m, [-w / 2 - 0.01, h - 0.005, sz * zs], [w / 2 + 0.035, h - 0.005, sz * zs], 0.018, { segs: k.seg(12, 6) });
    k.rod('frame', m, [-w / 2 + 0.01, 0.05, -zs + 0.003], [w / 2 - 0.01, 0.05, -zs + 0.003], 0.012, { segs: k.seg(10, 5) });
    k.rod('frame', m, [-w / 2 + 0.035, 0.05, zs - 0.003], [w / 2 + 0.01, 0.05, zs - 0.003], 0.012, { segs: k.seg(10, 5) });
    for (const x of [-0.2, 0, 0.2]) k.box('straps', p.strap, 0.06, 0.004, 2 * zs + 0.04, x + 0.012, h + 0.015, 0, { r: 0.0015 });
    if (p.suitcase) {
      const cw = 0.58, ch = 0.24, cd = 0.4, cy = h + 0.017;
      k.rbox('case', p.case, cw, ch, cd, 0.03, 0.012, cy + ch / 2, 0, { segs: 3 });
      k.box('case', p.case, cw + 0.004, 0.012, cd + 0.004, 0.012, cy + ch * 0.55, 0, { r: 0.004 });
      k.tube('caseHandle', 'leather-brown', [[-0.06 + 0.012, cy + ch * 0.6, cd / 2], [-0.04 + 0.012, cy + ch * 0.6, cd / 2 + 0.03], [0.04 + 0.012, cy + ch * 0.6, cd / 2 + 0.03], [0.06 + 0.012, cy + ch * 0.6, cd / 2]], 0.008, { segs: k.seg(12, 5), radial: k.seg(6, 4) });
    }
    return recentre(k.group());
  },
});

const hamper = item({
  id: 'laundry-hamper-woven', category: 'bedroom', ko: '라탄 빨래 바구니', en: 'Woven laundry hamper', size: [0.47, 0.66, 0.45],
  params: [
    P.len('height', '높이', 'Height', 0.58, 0.4, 0.75),
    P.mat('weave', '바구니', 'Basket', 'rattan', 'wood'),
    P.mat('liner', '안감', 'Liner', 'fabric-linen-white', 'fabric'),
    P.bool('lid', '뚜껑', 'Lid', true),
  ],
  tags: ['laundry hamper', 'laundry basket', 'woven basket', '빨래 바구니', '라탄 바구니', '세탁 바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, r0 = 0.16, r1 = 0.2;
    k.lathe('basket', p.weave, [[0, 0], [r0 - 0.01, 0], [r0, 0.01], [r1, h], [r1 - 0.012, h], [r0 - 0.012, 0.02], [0, 0.02]], 0, 0, 0, { segs: k.seg(36, 10) });
    // woven bands
    for (let i = 1; i < 6; i++) { const y = (h * i) / 6, rr = r0 + ((r1 - r0) * i) / 6; k.lathe('basket', p.weave, [[rr - 0.002, y - 0.008], [rr + 0.006, y - 0.004], [rr + 0.006, y + 0.004], [rr - 0.002, y + 0.008]], 0, 0, 0, { segs: k.seg(36, 10) }); }
    // rope handles
    for (const s of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); pts.push([s * (r1 + 0.005 + 0.025 * Math.sin(a)), h - 0.08 + 0.0, -0.05 * Math.cos(a)]); }
      k.tube('handles', 'fabric-linen-beige', pts, 0.007, { segs: k.seg(14, 6), radial: k.seg(6, 4) });
    }
    if (p.lid) {
      k.lathe('basket', p.weave, [[0, h + 0.002], [r1 + 0.012, h + 0.002], [r1 + 0.014, h + 0.02], [r1 - 0.02, h + 0.05], [0, h + 0.055]], 0, 0, 0, { smooth: 10, segs: k.seg(36, 10) });
      k.sphere('basket', p.weave, 0.022, 0, h + 0.065, 0, { scale: [1, 0.7, 1], segs: k.seg(12, 6), rings: k.seg(8, 4) });
    } else {
      const g = shellGeo(k.seg(48, 16), k.seg(6, 3), (u, v) => {
        const a = u * Math.PI * 2, rr = r1 + 0.004 + 0.012 * v + 0.006 * Math.sin(a * 9) * v;
        const y = v < 0.3 ? h - 0.06 + (v / 0.3) * 0.075 : h + 0.015 - ((v - 0.3) / 0.7) * 0.0;
        return [Math.cos(a) * (v < 0.3 ? r1 - 0.015 : rr), v < 0.3 ? y : h + 0.015 - (v - 0.3) * 0.12, -Math.sin(a) * (v < 0.3 ? r1 - 0.015 : rr)];
      }, 0.003);
      k.add('liner', p.liner, g);
    }
    return k.group();
  },
});

const screen = item({
  id: 'dressing-screen', category: 'bedroom', ko: '드레싱 스크린(병풍)', en: 'Folding dressing screen', size: [1.38, 1.75, 0.23],
  params: [
    P.int('panels', '패널 수', 'Panels', 3, 2, 5),
    P.pick('infill', '패널 면', 'Infill', 'cane', [['cane', '라탄', 'Cane'], ['fabric', '패브릭', 'Fabric'], ['slats', '살대', 'Slats']]),
    P.mat('wood', '프레임', 'Frame', 'wood-dark', 'wood'),
    P.mat('fabric', '패브릭', 'Fabric', 'fabric-linen-white', 'fabric'),
  ],
  tags: ['dressing screen', 'room divider', 'folding screen', '파티션', '병풍', '가림막', '드레싱 스크린'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const pw = 0.5, H = 1.75, t = 0.03, ang = 0.42, m = p.wood;
    let x = 0, z = 0;
    for (let i = 0; i < p.panels; i++) {
      const th = i % 2 === 0 ? ang : -ang;
      const cx = x + (Math.cos(th) * pw) / 2, cz = z - (Math.sin(th) * pw) / 2;
      transformAdded(k, () => {
        for (const s of [-1, 1]) k.box('frame', m, t, H, t, s * (pw / 2 - t / 2), H / 2, 0, { r: 0.004 });
        for (const y of [0.1, H - 0.02]) k.box('frame', m, pw - 2 * t, 0.04, t, 0, y, 0, { r: 0.003 });
        const ih = H - 0.12 - 0.04, iy = 0.12 + ih / 2;
        if (p.infill === 'cane') k.box('infill', 'rattan', pw - 2 * t, ih, 0.006, 0, iy, 0, { r: 0 });
        else if (p.infill === 'fabric') k.soft('infill', p.fabric, pw - 2 * t, ih, 0.012, 0.004, 0, iy, 0, { flat: 2 });
        else for (let j = 0; j < 6; j++) k.box('frame', m, 0.035, ih, 0.012, -pw / 2 + t + ((pw - 2 * t) / 6) * (j + 0.5), iy, 0, { r: 0.002 });
      }, cx, 0, cz, th);
      x += Math.cos(th) * pw; z -= Math.sin(th) * pw;
    }
    return recentre(k.group());
  },
});

const bedsideRug = item({
  id: 'rug-bedside', category: 'bedroom', ko: '침대 옆 러그', en: 'Bedside rug', size: [1.49, 0.01, 0.7],
  params: [
    P.len('length', '길이', 'Length', 1.4, 0.8, 2.4),
    P.len('width', '폭', 'Width', 0.7, 0.5, 1.0),
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각(술)', 'Rectangle with fringe'], ['oval', '타원', 'Oval'], ['round', '라운드 사각', 'Rounded']]),
    P.mat('rug', '러그', 'Rug', 'rug-pattern', 'carpet'),
  ],
  tags: ['bedside rug', 'runner rug', 'small rug', '침대 러그', '러그', '발매트', '카펫'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const l = p.length, w = p.width, th = 0.012;
    const shape = p.shape === 'oval' ? ellipse(l, w) : roundRect(l, w, p.shape === 'round' ? Math.min(0.15, w / 3) : 0.01);
    k.slab('rug', p.rug, shape, th, 0, { bevel: 0.003, curveSegs: 40 });
    if (p.shape === 'rect') {
      const n = Math.round(w / 0.018);
      for (const s of [-1, 1]) for (let i = 0; i < n; i++) k.box('fringe', 'rug-wool-cream', 0.05, 0.003, 0.005, s * (l / 2 + 0.022), 0.0015, -w / 2 + 0.01 + ((w - 0.02) * i) / (n - 1), { r: 0, ry: (((i * 37) % 7) - 3) * 0.04 });
    }
    return k.group();
  },
});

const bedTray = item({
  id: 'bed-tray', category: 'bedroom', ko: '침대 트레이', en: 'Breakfast bed tray', placement: 'surface', size: [0.6, 0.28, 0.36],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.bool('cup', '컵·접시', 'Cup & plate', true),
  ],
  tags: ['bed tray', 'breakfast tray', 'lap tray', '침대 트레이', '베드 테이블', '좌식 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, d = 0.36, legH = 0.2, m = p.wood;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', m, 0.022, legH, 0.022, sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05), { r: 0.004 });
    for (const sx of [-1, 1]) k.box('legs', m, 0.016, 0.016, d - 0.08, sx * (w / 2 - 0.05), 0.04, 0, { r: 0.003 });
    k.box('tray', m, w, 0.012, d, 0, legH + 0.006, 0, { r: 0.003 });
    for (const sz of [-1, 1]) k.box('tray', m, w, 0.035, 0.012, 0, legH + 0.012 + 0.0175, sz * (d / 2 - 0.006), { r: 0.003 });
    // end walls with handle slots
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(d / 2, 0.06), new THREE.Vector2(-d / 2, 0.06)]);
      sh.holes.push(new THREE.Path(roundRect(0.11, 0.022, 0.01).getPoints(8).map((v) => new THREE.Vector2(v.x, v.y + 0.035)).reverse()));
      k.panel('tray', m, sh, 0.012, sx * (w / 2 - 0.006), legH + 0.012, 0, { ry: Math.PI / 2, bevel: 0.002 });
    }
    if (p.cup) {
      const y = legH + 0.012;
      k.lathe('dishes', 'ceramic-white', [[0, 0], [0.06, 0], [0.1, 0.012], [0.105, 0.016], [0.1, 0.016], [0.058, 0.006], [0, 0.006]], 0.06, y, 0.0, { segs: k.seg(32, 10) });
      k.lathe('dishes', 'ceramic-white', [[0, 0], [0.03, 0], [0.04, 0.07], [0.036, 0.07], [0.028, 0.008], [0, 0.008]], -0.16, y, 0.03, { segs: k.seg(24, 8) });
      k.tube('dishes', 'ceramic-white', [[-0.122, y + 0.055, 0.03], [-0.1, y + 0.05, 0.03], [-0.1, y + 0.025, 0.03], [-0.124, y + 0.02, 0.03]], 0.005, { segs: k.seg(10, 4), radial: 5 });
    }
    return k.group();
  },
});

const storageOttoman = item({
  id: 'ottoman-storage-round', category: 'bedroom', ko: '원형 수납 오토만', en: 'Round storage ottoman', size: [0.52, 0.44, 0.52],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.5, 0.35, 0.8),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-green', 'fabric'),
    P.mat('base', '받침', 'Base', 'wood-oak', 'wood'),
  ],
  tags: ['storage ottoman', 'round pouf', 'ottoman', '수납 오토만', '푸프', '스툴', '원형 스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, h = 0.44, by = 0.04;
    k.lathe('base', p.base, [[0, 0], [R - 0.03, 0], [R - 0.025, by], [0, by]], 0, 0, 0, { segs: k.seg(40, 10) });
    k.lathe('body', p.fabric, [[0, by], [R - 0.01, by], [R, by + 0.02], [R, h - 0.1], [R - 0.008, h - 0.09], [0, h - 0.09]], 0, 0, 0, { smooth: 12, segs: k.seg(44, 12) });
    // lid cushion with a centre button
    k.lathe('lid', p.fabric, [[0, h - 0.088], [R - 0.004, h - 0.088], [R + 0.004, h - 0.06], [R - 0.01, h - 0.012], [R * 0.6, h - 0.002], [0.03, h - 0.012], [0, h - 0.016]], 0, 0, 0, { smooth: 16, segs: k.seg(44, 12) });
    k.sphere('lid', p.fabric, 0.016, 0, h - 0.016, 0, { scale: [1, 0.5, 1], segs: 10, rings: 5 });
    piping(k, 'lid', p.fabric, 2 * R + 0.002, 2 * R + 0.002, R, h - 0.088, 0, 0.005);
    return k.group();
  },
});

/* ------------------------------------------------------------ variants */

const bed = baseOf('bed'), dresser = baseOf('dresser'), wardrobe = baseOf('wardrobe'), nightstand = baseOf('nightstand');
const VARIANTS = [
  variant(bed, 'single-oak', '원목 싱글 침대', 'Single oak bed', { bedSize: 'single', headboard: 'wood', pillows: 1, throw: false }, { tags: ['single bed', '싱글 침대', '원룸'] }),
  variant(bed, 'usking-slat', '살대 헤드 US 킹 침대', 'US king slatted bed', { bedSize: 'usking', headboard: 'slat', wood: 'wood-walnut', pillows: 4, throwFabric: 'fabric-mustard' }, { tags: ['king bed', 'slatted headboard', '킹 침대', '살대 침대'] }),
  variant(bed, 'velvet-king', '벨벳 킹 침대', 'Velvet king bed', { bedSize: 'king', frameFabric: 'fabric-velvet-blue', beddingFabric: 'fabric-linen-white', throwFabric: 'fabric-velvet-rose', pillows: 3 }, { tags: ['velvet bed', '벨벳 침대'] }),
  variant(dresser, 'tallboy', '5단 톨 서랍장', 'Tallboy chest (5 drawers)', { width: 0.6, height: 1.25, rows: 5, cols: 1, body: 'wood-oak', front: 'wood-oak', handle: 'knob' }, { tags: ['tallboy', 'tall chest', '톨 서랍장', '5단'] }),
  variant(dresser, 'wide-6', '와이드 6칸 서랍장', 'Wide 6-drawer dresser', { width: 1.6, height: 0.78, rows: 2, cols: 3, body: 'wood-white', front: 'wood-oak', handle: 'edge' }, { tags: ['wide dresser', 'low dresser', '와이드 서랍장', '낮은 서랍장'] }),
  variant(wardrobe, '3door-drawers', '3도어 서랍 옷장', '3-door wardrobe with drawers', { width: 1.8, doors: 3, drawers: true, front: 'wood-walnut', body: 'wood-white', handle: 'knob' }, { tags: ['3 door wardrobe', '3도어 옷장', '서랍 옷장'] }),
  variant(wardrobe, 'sliding-oak', '오크 슬라이딩 옷장', 'Oak sliding wardrobe', { doorType: 'sliding', width: 2.0, doors: 2, front: 'wood-oak', body: 'wood-oak' }, { tags: ['sliding wardrobe', '슬라이딩 옷장', '원목'] }),
  variant(nightstand, 'open-white', '화이트 오픈 협탁', 'White open nightstand', { style: 'open', body: 'wood-white', front: 'wood-oak', handle: 'edge' }, { tags: ['open shelf', '오픈 협탁', '화이트'] }),
  variant(channelTall, 'velvet-king', '벨벳 하이 채널 킹 침대', 'Velvet channel-tufted king bed', { bedSize: 'king', frameFabric: 'fabric-velvet-rose', hbH: 1.5, throwFabric: 'fabric-wool-charcoal' }, { tags: ['velvet bed', 'king bed', '벨벳 침대', '킹 침대'] }),
  variant(platformLow, 'single', '저상형 싱글 침대', 'Low platform single bed', { bedSize: 'supersingle', deck: 0.1, wood: 'wood-pine', pillows: 1 }, { tags: ['single bed', '싱글 침대', '슈퍼싱글'] }),
  variant(ironSpindle, 'white', '화이트 철제 침대', 'White iron bed', { metal: 'metal-white', finials: 'metal-gold', bedSize: 'supersingle', pillows: 1, throwFabric: 'fabric-velvet-rose' }, { tags: ['white iron bed', '화이트 철제 침대', '프렌치'] }),
  variant(canopy, 'plain', '심플 캐노피 침대', 'Simple canopy bed', { drapes: false, frame: 'wood-black', bedSize: 'king', throwFabric: 'fabric-linen-beige' }, { tags: ['modern canopy', '모던 캐노피', '블랙 프레임'] }),
  variant(yo, 'single', '싱글 요·이불', 'Single floor bedding (yo)', { yoSize: 'single', pillows: 1, beddingFabric: 'fabric-velvet-blue' }, { tags: ['single yo', '싱글 요', '1인용'] }),
];

/* ------------------------------------------------------------ export */

export const BEDS = [platformLow, channelTall, wingback, canopy, fourPoster, storageDrawers, ottoman, daybed, sleigh, ironSpindle, cane, floating, murphy, yo, beddingStack, mattressOnly, divan, headboardWall];
export const OTHERS = [
  nsFloating, nsRound, nsRattan, nsTier, nsLamp, nsCabinet,
  chestGraduated, chestCampaign, dresserMirror, blanketChest,
  armoire, clothesRail, mirrorSliding, closetModule, jewelArmoire,
  hollywood, vanityStool, cheval, leaningArch,
  valet, blanketLadder, luggageRack, hamper, screen, bedsideRug, bedTray, storageOttoman,
];

export const ITEMS = [...BEDS, ...OTHERS, ...VARIANTS];
void drapeGeo;
