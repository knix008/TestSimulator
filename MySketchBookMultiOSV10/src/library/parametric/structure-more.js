// More structure items: niches, beams, classical/steel columns, arches, half walls, wainscoting,
// acoustic slats, more stairs and railings, ceiling coffers/medallions/soffits, radiators,
// mouldings, steps, a Korean maru, a bench nook, stoves and fireplaces, shoji screens,
// plus a few preset variants of structure.js entries. See ARCHITECTURE.md §12 → Library objects.
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THREE, Kit, item, P, variant, frameShape, roundRect, addCabinet, pillowGeo, rng, clamp } from './helpers.js';
import { withMatrix, centreKit } from './office.js';
import { ITEMS as BASE, profileX, arc, flight } from './structure.js';

const base = (id) => BASE.find((e) => e.id === id);

/* ---------------------------------------------------------------- helpers */

/** Lathe whose vertices are reshaped by fn(r, theta, y) → [r, y] (flutes, petals), welded for smooth shading. */
export function latheMod(k, role, mat, profile, segs, fn, x = 0, y = 0, z = 0, o = {}) {
  const geo = new THREE.LatheGeometry(profile.map(([r, py]) => new THREE.Vector2(Math.max(0, r), py)), segs);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i), r = Math.hypot(px, pz);
    if (r < 1e-6) continue;
    const [nr, ny] = fn(r, Math.atan2(px, pz), py);
    pos.setXYZ(i, (px * nr) / r, ny, (pz * nr) / r);
  }
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const m = mergeVertices(geo, 1e-5);
  m.computeVertexNormals();
  m.translate(x, y, z);
  return k.add(role, mat, m, o);
}

/** Fluted column shaft (n concave flutes with sharp arrises) between ya and yb, slight entasis. */
function flutedShaft(k, role, mat, r, ya, yb, n, depth, taper = 0.14) {
  const L = yb - ya, prof = [[0, ya], [r, ya], [r * 0.985, ya + 0.025]];
  for (let i = 1; i <= 7; i++) { const t = i / 8; prof.push([r * (1 - taper * t ** 1.6) * 0.985, ya + 0.025 + t * (L - 0.05)]); }
  const rt = r * (1 - taper);
  prof.push([rt * 0.985, yb - 0.025], [rt, yb], [0, yb]);
  latheMod(k, role, mat, prof, k.seg(n * 6, n * 2), (rr, th, y) => {
    if (y < ya + 0.02 || y > yb - 0.02) return [rr, y];
    const g = 0.5 + 0.5 * Math.cos(n * th);
    return [rr - depth * (1 - g ** 4), y];
  });
  return rt;
}

/** Shape from [x, y] points. */
const shapeOf = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

/**
 * Arch opening outline from (half, 0) up the right jamb, over the arch, down to (−half, 0).
 * style: 'round' | 'segmental' | 'pointed'; top = apex height.
 */
export function archOutline(half, top, style = 'round', n = 24) {
  const pts = [[half, 0]];
  if (style === 'segmental') {
    const rise = half * 0.45, spring = top - rise, R = (half * half + rise * rise) / (2 * rise), cy = top - R;
    const a0 = Math.atan2(spring - cy, half);
    pts.push([half, spring]);
    for (let i = 1; i < n; i++) { const a = a0 + (Math.PI - 2 * a0) * (i / n); pts.push([R * Math.cos(a), cy + R * Math.sin(a)]); }
    pts.push([-half, spring]);
  } else if (style === 'pointed') {
    const spring = top - Math.sqrt(3) * half, m = Math.max(2, Math.round(n / 2));
    pts.push([half, spring]);
    for (let i = 1; i <= m; i++) { const a = (Math.PI / 3) * (i / m); pts.push([-half + 2 * half * Math.cos(a), spring + 2 * half * Math.sin(a)]); }
    for (let i = 1; i < m; i++) { const a = (2 * Math.PI) / 3 + (Math.PI / 3) * (i / m); pts.push([half + 2 * half * Math.cos(a), spring + 2 * half * Math.sin(a)]); }
    pts.push([-half, spring]);
  } else {
    const spring = top - half;
    pts.push([half, spring]);
    for (let i = 1; i < n; i++) { const a = Math.PI * (i / n); pts.push([half * Math.cos(a), spring + half * Math.sin(a)]); }
    pts.push([-half, spring]);
  }
  pts.push([-half, 0]);
  return pts;
}

/** Logs + flame tongues + a glow light, centred at (cx, y0, z) inside a firebox `w` wide. */
export function addFire(k, cx, y0, z, w, maxH, { logs = 2, scaleZ = 0.35 } = {}) {
  for (let i = 0; i < logs; i++) {
    const lx = cx + (i - (logs - 1) / 2) * Math.min(0.26, w / (logs + 0.6));
    const half = Math.min(0.13, w * 0.3);
    k.rod('logs', 'wood-dark', [lx - half, y0 + 0.035, z + 0.02 * (i % 2 ? 1 : -1)], [lx + half, y0 + 0.03, z - 0.02 * (i % 2 ? 1 : -1)], 0.032, { segs: k.seg(10, 5) });
  }
  const flames = Math.max(3, Math.round(w / 0.12));
  for (let i = 0; i < flames; i++) {
    const fx = cx - w / 2 + 0.06 + (w - 0.12) * (i / (flames - 1));
    const fh = Math.min(maxH, 0.09 + 0.07 * Math.abs(Math.sin(i * 2.3 + 0.7)));
    k.lathe('flame', 'light-warm', [[0, 0], [0.04, 0.015], [0.036, fh * 0.35], [0.016, fh * 0.75], [0, fh]], fx, y0 + 0.03, z + 0.01, { smooth: 10, segs: k.seg(10, 5), scale: [1, 1, scaleZ], overrides: { color: '#ffb060', emissive: '#ff7a1a', emissiveIntensity: 1.6 } });
  }
  k.light(cx, y0 + 0.2, z + 0.05, { color: '#ff9a4a', intensity: 1.2, distance: 5 });
}

/* ------------------------------------------------------------------ niches */

function nicheBuild(p, ctx) {
  const k = new Kit(ctx);
  const w = p.width, h = p.height, d = 0.14, bw = 0.07, ft = 0.03;
  const arched = p.shape === 'arch', y0 = 0.07, top = h - bw;
  // an arch needs straight jambs below its spring line: narrow the opening on squat niches
  const half = arched ? Math.min((w - 2 * bw) / 2, Math.max(0.05, top - y0 - 0.1)) : (w - 2 * bw) / 2, ow = 2 * half;
  const inner = arched ? archOutline(half, top - y0, 'round', 28).map(([x, y]) => [x, y + y0]) : [[half, y0], [half, top], [-half, top], [-half, y0]];
  const grow = (pts, e) => (arched ? archOutline(half + e, top - y0 + e, 'round', 28).map(([x, y]) => [x, y + y0 - e]) : [[half + e, y0 - e], [half + e, top + e], [-half - e, top + e], [-half - e, y0 - e]]);
  // front surround: wall-coloured frame with the niche opening cut out
  const front = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
  front.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
  k.panel('surround', p.wall, front, ft, 0, 0, d / 2 - ft / 2, { bevel: 0.003 });
  // reveal lining + recessed back in the accent colour
  const lining = shapeOf(grow(inner, 0.012));
  lining.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
  k.panel('inside', p.inside, lining, d - ft - 0.012, 0, 0, -ft / 2 + 0.006 - 0.006, { bevel: 0.0005 });
  k.panel('inside', p.inside, shapeOf(grow(inner, 0.011)), 0.014, 0, 0, -d / 2 + 0.007, { bevel: 0.001 });
  // a stone sill that lips out a little
  k.box('sill', p.sill, ow + 0.04, 0.025, d + 0.012, 0, y0 + 0.0125 - 0.001, 0.006 - 0.003, { r: 0.004, segs: 2 });
  const shelves = arched ? (p.shelves ? 1 : 0) : (p.shelves ? Math.max(1, Math.round((top - y0) / 0.38) - 1) : 0);
  for (let i = 1; i <= shelves; i++) {
    const sy = y0 + ((top - y0) * i) / (shelves + 1) * (arched ? 0.9 : 1);
    k.box('shelves', 'wood-oak', ow - 0.004, 0.022, d - ft - 0.03, 0, sy, -0.004, { r: 0.002 });
  }
  if (p.led) {
    k.box('led', 'light-warm', arched ? 0.05 : ow - 0.04, 0.005, 0.012, 0, arched ? top - 0.012 : top - 0.004, d / 2 - ft - 0.02, { r: 0 });
    k.light(0, top - 0.05, 0, { intensity: 0.35, distance: 1.6 });
  }
  return k.group();
}

const nicheParams = (w, h, shelves, led) => [
  P.len('width', '폭', 'Width', w, 0.35, 1.6),
  P.len('height', '높이', 'Height', h, 0.5, 2.2),
  P.pick('shape', '모양', 'Shape', w < 0.7 ? 'arch' : 'rect', [['arch', '아치', 'Arched'], ['rect', '사각', 'Rectangular']]),
  P.bool('shelves', '선반', 'Shelves', shelves),
  P.bool('led', 'LED 조명', 'LED light', led),
  P.mat('wall', '벽 마감', 'Wall finish', 'wall-paint-white', 'wall'),
  P.mat('inside', '안쪽 마감', 'Inside finish', w < 0.7 ? 'wall-paint-terracotta' : 'wall-paint-warm', 'wall'),
  P.mat('sill', '받침', 'Sill', 'travertine', 'stone'),
];

const nicheArched = item({
  id: 'st-niche-arched', category: 'structure', placement: 'wall', elevation: 0.9, ko: '아치형 벽 니치', en: 'Arched wall niche', size: [0.6, 1.0, 0.152],
  params: nicheParams(0.6, 1.0, false, true),
  tags: ['niche', 'wall niche', 'arch', 'alcove', '니치', '벽감', '아치 니치', '매립 선반'],
  build: nicheBuild,
});

const nicheShelves = item({
  id: 'st-niche-shelves', category: 'structure', placement: 'wall', elevation: 0.5, ko: '선반형 벽 니치', en: 'Shelved wall niche', size: [0.9, 1.5, 0.152],
  params: nicheParams(0.9, 1.5, true, true),
  tags: ['niche', 'wall niche', 'display shelves', 'alcove', '니치', '벽감', '매립 선반', '장식장'],
  build: nicheBuild,
});

/* ------------------------------------------------------------------- beams */

const beamTimber = item({
  id: 'st-beam-timber', category: 'structure', placement: 'ceiling', elevation: 2.15, ko: '노출 목재 보', en: 'Exposed timber beam', size: [3.0, 0.256, 0.228],
  params: [
    P.len('length', '길이', 'Length', 3.0, 1.0, 8),
    P.len('width', '폭', 'Width', 0.2, 0.12, 0.4),
    P.len('height', '춤(높이)', 'Depth', 0.25, 0.15, 0.45),
    P.mat('wood', '나무', 'Wood', 'wood-dark', 'wood'),
    P.bool('straps', '철물 띠', 'Iron straps', true),
  ],
  tags: ['timber beam', 'exposed beam', 'rustic', '목재 보', '노출 보', '서까래', '대들보'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, w = p.width, h = p.height, c = 0.012, y0 = 0.006;
    profileX(k, 'beam', p.wood, [[-w / 2, c], [-w / 2 + c, 0], [w / 2 - c, 0], [w / 2, c], [w / 2, h - c], [w / 2 - c, h], [-w / 2 + c, h], [-w / 2, h - c]], L, y0, { bevel: 0.002 });
    if (p.straps) for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - 0.25);
      k.box('straps', 'metal-black', 0.07, 0.006, w + 0.012, x, 0.003, 0, { r: 0.001 });
      for (const sz of [-1, 1]) {
        k.box('straps', 'metal-black', 0.07, h * 0.75, 0.006, x, y0 + h * 0.375, sz * (w / 2 + 0.003), { r: 0.001 });
        for (const by of [0.3, 0.62]) k.cyl('straps', 'metal-black', 0.011, 0.011, 0.008, x, y0 + h * by, sz * (w / 2 + 0.006), { rx: sz * Math.PI / 2, segs: 6 });
      }
    }
    return k.group();
  },
});

const beamSteel = item({
  id: 'st-beam-steel', category: 'structure', placement: 'ceiling', elevation: 2.1, ko: 'H형강 보', en: 'Steel I-beam', size: [3.0, 0.3, 0.15],
  params: [
    P.len('length', '길이', 'Length', 3.0, 1.0, 10),
    P.len('height', '춤(높이)', 'Depth', 0.3, 0.15, 0.6),
    P.len('flange', '플랜지 폭', 'Flange width', 0.15, 0.1, 0.3),
    P.mat('finish', '도장', 'Finish', 'metal-black', 'metal'),
    P.bool('stiffeners', '보강판', 'Stiffeners', true),
  ],
  tags: ['steel beam', 'i-beam', 'h-beam', 'industrial', 'H형강', '철골 보', '인더스트리얼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height, b = p.flange, tf = 0.012, tw = 0.008;
    const pts = [[-b / 2, 0], [b / 2, 0], [b / 2, tf], [tw / 2 + 0.008, tf], [tw / 2, tf + 0.008], [tw / 2, h - tf - 0.008], [tw / 2 + 0.008, h - tf], [b / 2, h - tf], [b / 2, h], [-b / 2, h], [-b / 2, h - tf], [-tw / 2 - 0.008, h - tf], [-tw / 2, h - tf - 0.008], [-tw / 2, tf + 0.008], [-tw / 2 - 0.008, tf], [-b / 2, tf]];
    profileX(k, 'beam', p.finish, pts, L, 0, { bevel: 0.001 });
    if (p.stiffeners) {
      const n = Math.max(2, Math.round(L / 1.2) + 1);
      for (let i = 0; i < n; i++) for (const sz of [-1, 1]) {
        const x = -L / 2 + 0.05 + (L - 0.1) * (i / (n - 1));
        k.box('beam', p.finish, 0.01, h - 2 * tf - 0.002, b / 2 - tw / 2 - 0.006, x, h / 2, sz * (tw / 2 + (b / 2 - tw / 2 - 0.006) / 2 + 0.001), { r: 0.001 });
      }
    }
    return k.group();
  },
});

const beamBoxed = item({
  id: 'st-beam-boxed', category: 'structure', placement: 'ceiling', elevation: 2.12, ko: '박스 보(조명 매립)', en: 'Boxed beam with downlights', size: [3.0, 0.288, 0.4],
  params: [
    P.len('length', '길이', 'Length', 3.0, 1.0, 8),
    P.len('width', '폭', 'Width', 0.3, 0.2, 0.6),
    P.len('height', '춤(높이)', 'Depth', 0.28, 0.15, 0.5),
    P.mat('finish', '마감', 'Finish', 'wall-paint-white', 'wall'),
    P.bool('lights', '다운라이트', 'Downlights', true),
  ],
  tags: ['boxed beam', 'bulkhead', 'downlight', '박스 보', '천장 보', '다운라이트', '매립등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, w = p.width, h = p.height, s = 0.05;
    k.box('box', p.finish, L, h, w, 0, h / 2, 0, { r: 0.004, segs: 2 });
    // small cove mouldings where the box meets the ceiling, on both sides
    for (const sz of [-1, 1]) {
      const pts = [[0, 0], [0, s], [s, s], ...arc(s, 0, s, Math.PI / 2, Math.PI, 8).slice(1, -1)];
      profileX(k, 'box', p.finish, pts.map(([z, y]) => [sz * (w / 2 + z), y]), L, h - s, { bevel: 0.0006, curveSegs: 8 });
    }
    if (p.lights) {
      const n = Math.max(1, Math.round(L / 1.0));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (L / n) * (i + 0.5);
        k.cyl('trim', 'metal-white', 0.045, 0.045, 0.004, x, -0.003, 0, { segs: k.seg(24, 8) });
        k.cyl('lamp', 'light-warm', 0.032, 0.032, 0.002, x, -0.0035, 0, { segs: k.seg(20, 8) });
        k.light(x, -0.05, 0, { intensity: 0.5, distance: 3, type: 'spot', angle: 0.6 });
      }
    }
    centreKit(k);
    return k.group();
  },
});

/* ----------------------------------------------------------------- columns */

const columnDoric = item({
  id: 'st-column-doric', category: 'structure', ko: '도리아식 기둥', en: 'Doric column', size: [0.58, 2.6, 0.58],
  params: [
    P.len('height', '높이', 'Height', 2.6, 2.0, 4.0),
    P.len('diameter', '지름', 'Diameter', 0.4, 0.25, 0.7),
    P.int('flutes', '홈 수', 'Flutes', 20, 0, 24),
    P.mat('material', '마감', 'Finish', 'marble-white'),
  ],
  tags: ['doric column', 'classical column', 'fluted', 'pillar', '도리아식 기둥', '고전 기둥', '열주', '대리석 기둥'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, r = p.diameter / 2, m = p.material, ab = r * 2.9;
    // Tuscan-style square plinth + torus base
    k.box('column', m, ab * 0.92, 0.06, ab * 0.92, 0, 0.03, 0, { r: 0.004 });
    k.lathe('column', m, [[0, 0.06], [r * 1.18, 0.06], [r * 1.22, 0.085], [r * 1.16, 0.115], [r * 1.04, 0.125], [r * 1.02, 0.135], [0, 0.135]], 0, 0, 0, { smooth: 12, segs: k.seg(40, 12) });
    const yb = 0.135, yt = H - 0.2;
    const rt = p.flutes >= 4 ? flutedShaft(k, 'column', m, r, yb, yt, p.flutes, r * 0.07) : (k.lathe('column', m, [[0, yb], [r, yb], [r * 0.93, (yb + yt) / 2], [r * 0.86, yt], [0, yt]], 0, 0, 0, { smooth: 10, segs: k.seg(40, 12) }), r * 0.86);
    // necking, echinus (cushion) and square abacus
    k.lathe('column', m, [[0, yt], [rt * 1.02, yt], [rt * 1.04, yt + 0.02], [rt * 1.0, yt + 0.035], [rt * 1.08, yt + 0.06], [rt * 1.3, yt + 0.1], [ab / 2 * 0.93, yt + 0.125], [0, yt + 0.125]], 0, 0, 0, { smooth: 14, segs: k.seg(40, 12) });
    k.box('column', m, ab, H - yt - 0.125, ab, 0, (H + yt + 0.125) / 2, 0, { r: 0.004, segs: 2 });
    return k.group();
  },
});

const columnIonic = item({
  id: 'st-column-ionic', category: 'structure', ko: '이오니아식 기둥', en: 'Ionic column', size: [0.53, 2.7, 0.53],
  params: [
    P.len('height', '높이', 'Height', 2.7, 2.0, 4.0),
    P.len('diameter', '지름', 'Diameter', 0.34, 0.24, 0.6),
    P.mat('material', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['ionic column', 'classical column', 'volute', 'fluted', '이오니아식 기둥', '고전 기둥', '소용돌이 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, r = p.diameter / 2, m = p.material, pl = r * 3.1;
    // square plinth + Attic base (torus, scotia, torus)
    k.box('column', m, pl, 0.05, pl, 0, 0.025, 0, { r: 0.004 });
    k.lathe('column', m, [[0, 0.05], [r * 1.42, 0.05], [r * 1.46, 0.075], [r * 1.38, 0.1], [r * 1.2, 0.108], [r * 1.12, 0.125], [r * 1.24, 0.14], [r * 1.26, 0.16], [r * 1.14, 0.18], [r * 1.02, 0.19], [0, 0.19]], 0, 0, 0, { smooth: 18, segs: k.seg(40, 12) });
    const yb = 0.19, capH = 0.2, yt = H - capH;
    const rt = flutedShaft(k, 'column', m, r, yb, yt, 24, r * 0.065, 0.12);
    // echinus with egg-and-dart hint, abacus, volute bolsters + spirals on the front and back
    k.lathe('column', m, [[0, yt], [rt * 1.06, yt], [rt * 1.08, yt + 0.02], [rt * 1.25, yt + 0.07], [rt * 1.22, yt + 0.11], [0, yt + 0.11]], 0, 0, 0, { smooth: 10, segs: k.seg(40, 12) });
    const D = rt * 2.6, vx = rt * 1.25, vr = rt * 0.5, vy = yt + 0.11 - vr * 0.35;
    k.box('column', m, 2 * vx, 0.05, D, 0, yt + 0.11 + 0.025 - 0.035, 0, { r: 0.006, segs: 2 });
    for (const sx of [-1, 1]) {
      k.cyl('column', m, vr, vr, D, sx * vx, vy, -D / 2, { rx: Math.PI / 2, segs: k.seg(28, 10) });
      for (const sz of [-1, 1]) {
        const pts = [];
        const turns = 2.4, N = k.hi ? 60 : 24;
        for (let i = 0; i <= N; i++) {
          const t = i / N, a = Math.PI / 2 + sx * t * turns * Math.PI * 2, rad = vr * 0.92 * (1 - t * 0.82);
          pts.push([sx * vx + Math.cos(a) * rad * -sx, vy + Math.sin(a) * rad, sz * (D / 2 + 0.004)]);
        }
        k.tube('column', m, pts, 0.008, { radial: k.seg(8, 4), segs: k.seg(70, 24) });
        k.sphere('column', m, 0.022, sx * vx, vy, sz * (D / 2 + 0.006), { segs: k.seg(12, 6), rings: k.seg(8, 4), scale: [1, 1, 0.6] });
      }
    }
    const abH = H - (yt + 0.11 + 0.05 - 0.035 + 0.025);
    k.box('column', m, 2 * vx + 0.02, Math.max(0.025, abH), D + 0.02, 0, H - Math.max(0.025, abH) / 2, 0, { r: 0.004, segs: 2 });
    return k.group();
  },
});

const columnSteel = item({
  id: 'st-column-steel', category: 'structure', ko: 'H형강 기둥', en: 'Steel H-column', size: [0.36, 2.4, 0.36],
  params: [
    P.len('height', '높이', 'Height', 2.4, 2.0, 4.5),
    P.len('size', '단면 크기', 'Section size', 0.2, 0.12, 0.4),
    P.mat('finish', '도장', 'Finish', 'metal-black', 'metal'),
    P.bool('plates', '베이스·캡 플레이트', 'Base & cap plates', true),
  ],
  tags: ['steel column', 'h-column', 'industrial', 'loft', '철골 기둥', 'H형강', '인더스트리얼', '로프트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = p.size, tf = 0.012, tw = 0.009, pt = p.plates ? 0.02 : 0;
    // H section in plan: flanges along x at z = ±s/2, web along z
    const pts = [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, -s / 2 + tf], [tw / 2, -s / 2 + tf], [tw / 2, s / 2 - tf], [s / 2, s / 2 - tf], [s / 2, s / 2], [-s / 2, s / 2], [-s / 2, s / 2 - tf], [-tw / 2, s / 2 - tf], [-tw / 2, -s / 2 + tf], [-s / 2, -s / 2 + tf]];
    k.slab('column', p.finish, shapeOf(pts), H - 2 * pt, pt, { bevel: 0.001, curveSegs: 2 });
    if (p.plates) {
      const b = s + 0.16;
      k.box('plates', p.finish, b, pt, b, 0, pt / 2, 0, { r: 0.002 });
      k.box('plates', p.finish, s + 0.04, pt, s + 0.04, 0, H - pt / 2, 0, { r: 0.002 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        k.cyl('bolts', 'metal-steel', 0.012, 0.012, 0.045, sx * (b / 2 - 0.035), pt, sz * (b / 2 - 0.035), { segs: 8 });
        k.cyl('bolts', 'metal-steel', 0.02, 0.02, 0.014, sx * (b / 2 - 0.035), pt, sz * (b / 2 - 0.035), { segs: 6 });
      }
    }
    return k.group();
  },
});

const columnMushroom = item({
  id: 'st-column-mushroom', category: 'structure', ko: '버섯형 콘크리트 기둥', en: 'Mushroom concrete column', size: [1.0, 2.6, 1.0],
  params: [
    P.len('height', '높이', 'Height', 2.6, 2.2, 4.5),
    P.len('diameter', '지름', 'Diameter', 0.36, 0.25, 0.6),
    P.len('capital', '머리 폭', 'Capital width', 1.0, 0.6, 1.6),
    P.mat('material', '마감', 'Finish', 'concrete', 'stone'),
  ],
  tags: ['mushroom column', 'concrete column', 'flared', 'brutalist', '콘크리트 기둥', '버섯 기둥', '노출 콘크리트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, r = p.diameter / 2, C = p.capital, flare = Math.min(0.55, C * 0.5);
    const y1 = H - 0.08 - flare;
    k.cyl('column', p.material, r, r, y1, 0, 0, 0, { segs: k.seg(40, 12) });
    // flared capital: a concave trumpet curve up to a round slab, then a square drop panel
    const prof = [[0, y1]];
    for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([r + (C / 2 * 0.9 - r) * t ** 2.2, y1 + flare * t]); }
    prof.push([0, y1 + flare]);
    k.lathe('column', p.material, prof, 0, 0, 0, { segs: k.seg(40, 12) });
    k.box('column', p.material, C, 0.08, C, 0, H - 0.04, 0, { r: 0.006, segs: 2 });
    return k.group();
  },
});

const columnBrick = item({
  id: 'st-column-brick', category: 'structure', ko: '벽돌 기둥', en: 'Brick pillar', size: [0.52, 1.2, 0.52],
  params: [
    P.len('height', '높이', 'Height', 1.2, 0.5, 3.0),
    P.len('size', '굵기', 'Size', 0.45, 0.3, 0.8),
    P.mat('brick', '벽돌', 'Brick', 'wall-brick-red', 'wall'),
    P.mat('cap', '갓돌', 'Coping', 'concrete', 'stone'),
  ],
  tags: ['brick pillar', 'brick column', 'gate pier', '벽돌 기둥', '조적 기둥', '문주'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = p.size, ct = 0.06;
    k.box('base', p.cap, s + 0.03, 0.06, s + 0.03, 0, 0.03, 0, { r: 0.004 });
    k.box('brick', p.brick, s, H - 0.06 - ct - 0.03, s, 0, 0.06 + (H - 0.06 - ct - 0.03) / 2, 0, { r: 0.003 });
    // projecting brick band under the cap + pyramid coping stone
    k.box('brick', p.brick, s + 0.02, 0.03, s + 0.02, 0, H - ct - 0.015, 0, { r: 0.003 });
    k.box('base', p.cap, s + 0.07, ct * 0.6, s + 0.07, 0, H - ct + ct * 0.3, 0, { r: 0.005 });
    k.cyl('base', p.cap, 0.001, (s + 0.04) * 0.7071, ct * 0.4, 0, H - ct * 0.4, 0, { segs: 4, ry: Math.PI / 4 });
    return k.group();
  },
});

/* ------------------------------------------------------------- arch & walls */

const archWall = item({
  id: 'st-arch-wall', category: 'structure', ko: '아치 개구부 벽', en: 'Arched opening wall', size: [1.8, 2.4, 0.19],
  params: [
    P.len('width', '벽 폭', 'Wall width', 1.8, 1.2, 4.0),
    P.len('height', '벽 높이', 'Wall height', 2.4, 2.1, 3.2),
    P.len('openWidth', '개구부 폭', 'Opening width', 0.9, 0.6, 2.0),
    P.len('openHeight', '개구부 높이', 'Opening height', 2.1, 1.6, 2.8),
    P.pick('style', '아치 모양', 'Arch style', 'round', [['round', '반원', 'Round'], ['segmental', '평아치', 'Segmental'], ['pointed', '첨두', 'Pointed']]),
    P.len('thickness', '두께', 'Thickness', 0.15, 0.08, 0.35),
    P.mat('finish', '벽 마감', 'Wall finish', 'wall-plaster', 'wall'),
    P.bool('casing', '몰딩 테두리', 'Casing', true),
  ],
  tags: ['arch', 'archway', 'arched wall', 'room divider', '아치', '아치 벽', '아치 개구부', '가벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, t = p.thickness, cw = 0.07;
    const half = Math.min(p.openWidth, w - 0.3) / 2;
    const top = Math.min(p.openHeight, h - 0.12 - (p.casing ? cw : 0));
    const inner = archOutline(half, Math.max(top, half * (p.style === 'pointed' ? 1.8 : 1.05)), p.style, 28);
    const wall = [[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0], ...[...inner].reverse()];
    k.panel('wall', p.finish, shapeOf(wall), t, 0, 0, 0, { bevel: 0.003 });
    if (p.casing) {
      const outer = archOutline(half + cw, Math.max(top, half * (p.style === 'pointed' ? 1.8 : 1.05)) + cw, p.style, 28);
      const ring = shapeOf([...outer, ...[...inner].reverse()]);
      for (const s of [-1, 1]) k.panel('casing', 'paint-white-matte', ring, 0.02, 0, 0, s * (t / 2 + 0.01), { bevel: 0.004, bevelSegs: 3 });
    }
    for (const s of [-1, 1]) for (const sx of [-1, 1]) {
      const bl = w / 2 - half - (p.casing ? cw : 0);
      k.box('casing', 'paint-white-matte', bl, 0.09, 0.014, sx * (w / 2 - bl / 2), 0.045, s * (t / 2 + 0.007), { r: 0.002 });
    }
    return k.group();
  },
});

const halfWall = item({
  id: 'st-half-wall', category: 'structure', ko: '하프 월(낮은 가벽)', en: 'Half wall with cap', size: [1.5, 1.05, 0.2],
  params: [
    P.len('length', '길이', 'Length', 1.5, 0.5, 5),
    P.len('height', '높이', 'Height', 1.05, 0.6, 1.4),
    P.len('thickness', '두께', 'Thickness', 0.12, 0.08, 0.25),
    P.pick('top', '상부', 'Top', 'none', [['none', '없음', 'None'], ['glass', '유리 패널', 'Glass panel'], ['posts', '기둥', 'Posts to ceiling']]),
    P.mat('finish', '벽 마감', 'Wall finish', 'wall-paint-white', 'wall'),
    P.mat('cap', '상판', 'Cap', 'wood-oak'),
  ],
  tags: ['half wall', 'pony wall', 'knee wall', 'divider', '하프월', '낮은 벽', '가벽', '칸막이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height, t = p.thickness, ct = 0.035, cw = t + 0.08;
    k.box('wall', p.finish, L, h - ct, t, 0, (h - ct) / 2, 0, { r: 0.003 });
    k.box('cap', p.cap, L + 0.03, ct, cw, 0, h - ct / 2, 0, { r: 0.008, segs: 2 });
    for (const s of [-1, 1]) k.box('trim', 'paint-white-matte', L + 0.002, 0.09, 0.012, 0, 0.045, s * (t / 2 + 0.006), { r: 0.002 });
    if (p.top === 'glass') {
      k.box('trim', 'metal-black', L, 0.04, 0.03, 0, h + 0.02, 0, { r: 0.002 });
      k.box('glass', 'glass-clear', L - 0.01, 0.9, 0.01, 0, h + 0.03 + 0.45, 0, { r: 0.002 });
      k.box('trim', 'metal-black', L, 0.03, 0.03, 0, h + 0.94, 0, { r: 0.002 });
    } else if (p.top === 'posts') {
      const n = Math.max(2, Math.round(L / 0.5) + 1);
      for (let i = 0; i < n; i++) k.box('cap', p.cap, 0.07, 2.4 - h, 0.07, -L / 2 + 0.035 + (L - 0.07) * (i / (n - 1)), h + (2.4 - h) / 2, 0, { r: 0.006, segs: 2 });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------ wall panelling */

function wainscot(p, ctx) {
  const k = new Kit(ctx);
  const L = p.length, H = p.height, d = 0.04, bH = 0.12;
  const zb = -d / 2;
  k.box('board', p.finish, L, H - 0.03, 0.012, 0, (H - 0.03) / 2, zb + 0.006, { r: 0.001 });
  // skirting along the bottom, a moulded cap rail on top
  profileX(k, 'trim', p.finish, [[zb, 0], [zb + 0.03, 0], [zb + 0.03, bH - 0.012], ...arc(zb + 0.018, bH - 0.012, 0.012, 0, Math.PI / 2, 4), [zb, bH]], L, 0, { bevel: 0.0008 });
  profileX(k, 'trim', p.finish, [[zb, 0], [zb + 0.028, 0], [zb + 0.028, 0.008], [zb + 0.034, 0.012], ...arc(zb + 0.03, 0.022, 0.012, -0.2, Math.PI / 2, 6), [zb, 0.034]], L + 0.01, H - 0.034, { bevel: 0.0008 });
  if (p.style === 'raised') {
    const nb = Math.max(1, Math.round(L / 0.55)), sw = 0.075, rail = 0.075;
    const y0 = bH, y1 = H - 0.034;
    const fz = zb + 0.012 + 0.009;
    for (let i = 0; i <= nb; i++) k.box('frame', p.finish, sw, y1 - y0, 0.018, -L / 2 + sw / 2 + (L - sw) * (i / nb), (y0 + y1) / 2, fz, { r: 0.002 });
    k.box('frame', p.finish, L, rail, 0.018, 0, y0 + rail / 2, fz, { r: 0.002 });
    k.box('frame', p.finish, L, rail, 0.018, 0, y1 - rail / 2, fz, { r: 0.002 });
    const bw = (L - sw * (nb + 1)) / nb, ph = y1 - y0 - 2 * rail;
    for (let i = 0; i < nb; i++) {
      const cx = -L / 2 + sw + bw / 2 + i * (bw + sw);
      // a raised field panel: wide bevel makes the chamfered edge
      k.panel('panels', p.finish, roundRect(bw - 0.012, ph - 0.012, 0.002), 0.016, cx, y0 + rail + ph / 2, fz - 0.001, { bevel: 0.0075, bevelSegs: 2, curveSegs: 2 });
    }
  } else {
    // board & batten: vertical battens, a top ledge rail and a little shelf
    const n = Math.max(2, Math.round(L / 0.4) + 1), bw = 0.06;
    for (let i = 0; i < n; i++) k.box('frame', p.finish, bw, H - bH - 0.11, 0.018, -L / 2 + bw / 2 + (L - bw) * (i / (n - 1)), bH + (H - bH - 0.11) / 2, zb + 0.012 + 0.009, { r: 0.002 });
    k.box('frame', p.finish, L, 0.08, 0.018, 0, H - 0.034 - 0.04, zb + 0.012 + 0.009, { r: 0.002 });
  }
  return k.group();
}

const wainscotParams = (style, H, finish) => [
  P.len('length', '길이', 'Length', 1.2, 0.4, 6),
  P.len('height', '높이', 'Height', H, 0.6, 1.8),
  P.pick('style', '형태', 'Style', style, [['raised', '레이즈드 패널', 'Raised panel'], ['batten', '보드 앤 배튼', 'Board & batten']]),
  P.mat('finish', '마감', 'Finish', finish),
];

const wainscotRaised = item({
  id: 'st-wainscot-panel', category: 'structure', placement: 'wall', elevation: 0, ko: '웨인스코팅(레이즈드 패널)', en: 'Raised-panel wainscoting', size: [1.21, 0.9, 0.044],
  params: wainscotParams('raised', 0.9, 'paint-white-matte'),
  tags: ['wainscoting', 'wall panelling', 'raised panel', 'dado', '웨인스코팅', '벽 패널', '판넬 몰딩', '징두리'],
  build: wainscot,
});

const boardBatten = item({
  id: 'st-board-batten', category: 'structure', placement: 'wall', elevation: 0, ko: '보드 앤 배튼 벽장식', en: 'Board & batten panelling', size: [1.21, 1.2, 0.044],
  params: wainscotParams('batten', 1.2, 'paint-green-matte'),
  tags: ['board and batten', 'wall panelling', 'wainscoting', 'farmhouse', '보드 앤 배튼', '벽 패널', '웨인스코팅'],
  build: wainscot,
});

const acousticSlats = item({
  id: 'st-acoustic-slats', category: 'structure', placement: 'wall', elevation: 0, ko: '흡음 우드 슬랫 패널', en: 'Acoustic slat panel', size: [0.6, 2.4, 0.03],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.3, 3.0),
    P.len('height', '높이', 'Height', 2.4, 0.6, 3.0),
    P.mat('wood', '슬랫', 'Slats', 'wood-oak', 'wood'),
    P.mat('felt', '흡음 펠트', 'Felt', 'fabric-wool-charcoal', 'fabric'),
  ],
  tags: ['acoustic panel', 'slat wall', 'wood slats', 'akupanel', '흡음 패널', '우드 슬랫', '루버 벽', '템바보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, ft = 0.009, sd = 0.021, sw = 0.027, pitch = 0.04;
    k.box('felt', p.felt, w, h, ft, 0, h / 2, -0.015 + ft / 2, { r: 0.001 });
    const n = Math.max(2, Math.round((w - sw) / pitch) + 1), step = (w - sw) / (n - 1);
    for (let i = 0; i < n; i++) k.box('slats', p.wood, sw, h, sd, -w / 2 + sw / 2 + i * step, h / 2, -0.015 + ft + sd / 2, { r: 0.0015 });
    return k.group();
  },
});

/* ------------------------------------------------------------------ stairs */

const spiral = item({
  id: 'st-stairs-spiral', category: 'structure', ko: '나선형 계단', en: 'Spiral staircase', size: [1.6, 3.5, 1.6],
  params: [
    P.len('rise', '층고(전체 높이)', 'Total rise', 2.6, 1.5, 4.0),
    P.len('diameter', '지름', 'Diameter', 1.6, 1.2, 2.4),
    P.mat('tread', '디딤판', 'Treads', 'wood-oak', 'wood'),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.pick('turn', '회전 방향', 'Turn', 'ccw', [['ccw', '반시계', 'Counter-clockwise'], ['cw', '시계', 'Clockwise']]),
  ],
  tags: ['spiral staircase', 'spiral stairs', 'helical', '나선형 계단', '원형 계단', '회전 계단', '계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, r0 = 0.055, n = Math.max(6, Math.ceil(p.rise / 0.2)), rh = p.rise / n;
    const da = ((330 / n) * Math.PI) / 180, dir = p.turn === 'cw' ? -1 : 1, rail = 0.9;
    k.cyl('pole', p.metal, r0, r0, p.rise + rail, 0, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('pole', p.metal, 0.15, 0.16, 0.012, 0, 0, 0, { segs: k.seg(24, 8) });
    const railPts = [];
    for (let i = 1; i <= n; i++) {
      const a0 = dir * (i - 1) * da, a1 = a0 + dir * da * 1.04;
      const pts = [];
      const N = k.hi ? 8 : 4;
      for (let j = 0; j <= N; j++) { const a = a0 + (a1 - a0) * (j / N); pts.push(new THREE.Vector2(Math.sin(a) * R, Math.cos(a) * R)); }
      for (let j = N; j >= 0; j--) { const a = a0 + (a1 - a0) * (j / N); pts.push(new THREE.Vector2(Math.sin(a) * r0 * 0.9, Math.cos(a) * r0 * 0.9)); }
      k.slab('treads', p.tread, new THREE.Shape(pts), 0.04, i * rh - 0.04, { bevel: 0.004, bevelSegs: 2, curveSegs: 2 });
      // steel bracket under each tread along its leading edge
      const am = a0 + dir * da * 0.15;
      k.box('frame', p.metal, 0.03, 0.04, R - r0 - 0.04, Math.sin(am) * (R + r0) / 2, i * rh - 0.06, Math.cos(am) * (R + r0) / 2, { r: 0.003, ry: am });
      const ab = a0 + dir * da * 0.5, br = R - 0.035;
      k.rod('frame', p.metal, [Math.sin(ab) * br, i * rh, Math.cos(ab) * br], [Math.sin(ab) * br, i * rh + rail, Math.cos(ab) * br], 0.009, { segs: k.seg(8, 4) });
      railPts.push([Math.sin(ab) * br, i * rh + rail, Math.cos(ab) * br]);
    }
    k.tube('rail', p.metal, railPts, 0.022, { radial: k.seg(12, 5), segs: k.seg(n * 8, n * 2), caps: true });
    centreKit(k, { y: false });
    return k.group();
  },
});

const floating = item({
  id: 'st-stairs-floating', category: 'structure', ko: '캔틸레버 계단', en: 'Floating cantilever stairs', size: [0.91, 3.55, 4.2],
  params: [
    P.len('rise', '층고(전체 높이)', 'Total rise', 2.6, 0.8, 4.0),
    P.len('width', '폭', 'Width', 0.9, 0.7, 1.4),
    P.len('run', '디딤판 깊이', 'Tread run', 0.28, 0.24, 0.32),
    P.mat('tread', '디딤판', 'Treads', 'wood-oak', 'wood'),
    P.bool('glass', '유리 난간', 'Glass balustrade', true),
  ],
  tags: ['floating stairs', 'cantilever stairs', 'open riser', 'modern stairs', '캔틸레버 계단', '떠있는 계단', '오픈 계단', '계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.max(3, Math.ceil(p.rise / 0.18)), rh = p.rise / n, run = p.run, w = p.width, tt = 0.07;
    // thick treads fixed to a slim steel plate in the wall (left side)
    for (let i = 1; i <= n; i++) k.box('treads', p.tread, w, tt, run, 0, i * rh - tt / 2, -(i - 0.5) * run, { r: 0.004, segs: 2 });
    const L = n * run;
    const plate = [[0, 0], [0, rh * 1.0 + 0.02], [-(L - run), n * rh + 0.02], [-L, n * rh + 0.02], [-L, n * rh - 0.3], [-(0.3 * run) / rh, 0]];
    profileX(k, 'plate', 'metal-black', plate.map(([z, y]) => [z, y]), 0.012, 0, { bevel: 0.001 });
    for (const pt of k.parts.values()) if (pt.role === 'plate') pt.geos[pt.geos.length - 1].translate(-w / 2 - 0.006, 0, 0);
    if (p.glass) {
      const x = w / 2 - 0.05, gh = 0.95;
      const g = [[-run * 0.5, rh], [-(L - run * 0.5), n * rh], [-(L - run * 0.5), n * rh + gh], [-run * 0.5, rh + gh]];
      const shape = new THREE.Shape(g.map(([z, y]) => new THREE.Vector2(-z, y)));
      k.panel('glass', 'glass-clear', shape, 0.012, x, 0, 0, { ry: Math.PI / 2, bevel: 0.001, curveSegs: 2 });
      for (let i = 1; i <= n; i += 2) k.box('clamps', 'metal-steel', 0.03, 0.05, 0.05, x, i * rh - tt - 0.0, -(i - 0.5) * run, { r: 0.004 });
    }
    centreKit(k);
    return k.group();
  },
});

const stairsU = item({
  id: 'st-stairs-u', category: 'structure', ko: 'U자형 계단(중간참)', en: 'U-shaped stairs with landing', size: [1.92, 3.53, 2.72],
  params: [
    P.len('rise', '층고(전체 높이)', 'Total rise', 2.6, 1.6, 4.0),
    P.len('width', '계단 폭', 'Flight width', 0.9, 0.7, 1.3),
    P.len('gap', '계단 사이 간격', 'Well gap', 0.1, 0.02, 0.6),
    P.len('run', '디딤판 깊이', 'Tread run', 0.26, 0.22, 0.32),
    P.pick('rail', '난간', 'Handrail', 'baluster', [['glass', '유리', 'Glass'], ['baluster', '난간살', 'Balusters'], ['none', '없음', 'None']]),
    P.mat('tread', '디딤판', 'Treads', 'wood-walnut', 'wood'),
    P.mat('riser', '챌판·옆판', 'Risers & strings', 'paint-white-matte'),
  ],
  tags: ['u-shaped stairs', 'switchback', 'half-turn stairs', 'landing', 'U자 계단', '꺾인 계단', '중간참', '계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.max(5, Math.ceil(p.rise / 0.19)), rh = p.rise / n, w = p.width, g = p.gap, run = p.run;
    const n1 = Math.floor((n - 1) / 2), n2 = n - n1 - 1;
    const b = { w, rh, run, tread: p.tread, riser: p.riser, string: p.riser, rail: p.rail };
    const rails = p.rail === 'none' ? [] : ['left'];
    withMatrix(k, () => flight(k, { ...b, count: n1, rails }), new THREE.Matrix4().makeTranslation(-(w + g) / 2, 0, 0));
    const ly = (n1 + 1) * rh, L1 = n1 * run, W = 2 * w + g;
    k.box('strings', p.riser, W, ly - 0.04, w, 0, (ly - 0.04) / 2, -L1 - w / 2, { r: 0.003 });
    k.box('treads', p.tread, W + 0.01, 0.04, w + 0.025, 0, ly - 0.02, -L1 - w / 2 + 0.0125, { r: 0.004, segs: 2 });
    const m = new THREE.Matrix4().makeTranslation((w + g) / 2, ly, -L1).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    withMatrix(k, () => flight(k, { ...b, count: n2, rails }), m);
    centreKit(k);
    return k.group();
  },
});

const ladder = item({
  id: 'st-stairs-ladder', category: 'structure', ko: '사다리 계단(다락)', en: 'Ladder stair (loft)', size: [0.6, 3.5, 1.35],
  params: [
    P.len('rise', '높이', 'Rise', 2.6, 1.2, 3.5),
    P.len('width', '폭', 'Width', 0.6, 0.45, 0.8),
    P.num('angle', '경사(도)', 'Pitch (°)', 65, 55, 75, 1),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
    P.bool('rails', '손잡이', 'Handrails', true),
  ],
  tags: ['ladder stair', 'loft ladder', 'ship ladder', 'attic stairs', '사다리 계단', '다락 계단', '복층 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.rise, w = p.width, a = THREE.MathUtils.degToRad(p.angle), run = H / Math.tan(a), Ls = H / Math.sin(a);
    const sd = 0.15, st = 0.035, n = Math.max(4, Math.round(H / 0.22)), rh = H / n;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - st / 2);
      k.box('stringers', p.wood, st, sd, Ls, x, H / 2, 0, { r: 0.004, segs: 2, rx: a });
      if (p.rails) {
        // handrail parallel to the stringer, 0.85 m above its centre line, on two posts
        const yc = (z) => (run / 2 - z) * Math.tan(a), off = 0.75, rx = x + sx * (st / 2 + 0.012);
        const z0 = run / 2 - 0.2 / Math.tan(a), z1 = -run / 2 + 0.02;
        k.rod('rails', 'metal-black', [rx, yc(z0) + off, z0], [rx, yc(z1) + off, z1], 0.016, { segs: k.seg(10, 5) });
        for (const t of [0.2, 0.9]) {
          const z = z0 + (z1 - z0) * t;
          k.rod('rails', 'metal-black', [rx, yc(z), z], [rx, yc(z) + off, z], 0.01, { segs: k.seg(8, 4) });
        }
      }
    }
    // treads housed between the stringers, kept level
    for (let i = 1; i <= n; i++) {
      const y = i * rh - 0.015, z = run / 2 - y / Math.tan(a);
      k.box('treads', p.wood, w - 2 * st + 0.01, 0.03, 0.16, 0, y, z - 0.02, { r: 0.003 });
    }
    centreKit(k);
    return k.group();
  },
});

const mono = item({
  id: 'st-stairs-mono', category: 'structure', ko: '센터 철골 계단', en: 'Mono-stringer stairs', size: [0.9, 2.6, 4.1],
  params: [
    P.len('rise', '층고(전체 높이)', 'Total rise', 2.6, 0.8, 4.0),
    P.len('width', '폭', 'Width', 0.9, 0.7, 1.4),
    P.len('run', '디딤판 깊이', 'Tread run', 0.27, 0.24, 0.32),
    P.mat('tread', '디딤판', 'Treads', 'wood-walnut', 'wood'),
    P.mat('steel', '철골', 'Steel', 'metal-black', 'metal'),
  ],
  tags: ['mono stringer', 'steel stairs', 'open riser', 'spine stairs', '센터 계단', '철골 계단', '오픈 계단', '계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.max(3, Math.ceil(p.rise / 0.18)), rh = p.rise / n, run = p.run, w = p.width, tt = 0.05;
    for (let i = 1; i <= n; i++) {
      const zc = -(i - 0.5) * run;
      k.box('treads', p.tread, w, tt, run + 0.02, 0, i * rh - tt / 2, zc, { r: 0.004, segs: 2 });
      k.box('brackets', p.steel, w * 0.45, 0.012, run * 0.6, 0, i * rh - tt - 0.006, zc, { r: 0.002 });
    }
    // sloped box spine under the treads (side profile), touching the floor at the front
    const slope = rh / run, zc1 = -0.5 * run, y1 = rh - tt - 0.012;
    const topAt = (z) => y1 + (zc1 - z) * slope, deep = 0.2;
    const zEnd = -(n - 0.5) * run;
    const zTop0 = zc1 + y1 / slope, zBot0 = zc1 + (y1 - deep) / slope;
    const spine = [[zTop0, 0], [zEnd, topAt(zEnd)], [zEnd, topAt(zEnd) - deep], [Math.min(zBot0, zTop0 - 0.05), Math.max(0, topAt(zBot0) - deep)]];
    if (zBot0 > zEnd) spine.splice(3, 1, [zBot0, 0]);
    profileX(k, 'spine', p.steel, spine, 0.12, 0, { bevel: 0.002 });
    centreKit(k);
    return k.group();
  },
});

/* ----------------------------------------------------------------- railings */

const railSpindle = item({
  id: 'st-railing-spindle', category: 'structure', ko: '목재 난간(선반 난간살)', en: 'Turned spindle railing', size: [2.02, 1.08, 0.11],
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.6, 6),
    P.len('height', '높이', 'Height', 0.92, 0.8, 1.1),
    P.mat('spindles', '난간살', 'Spindles', 'paint-white-matte'),
    P.mat('rail', '손잡이·기둥', 'Handrail & newels', 'wood-walnut', 'wood'),
  ],
  tags: ['spindle railing', 'banister', 'balusters', 'newel post', '목재 난간', '난간살', '계단 난간', '뉴얼 포스트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height, np = 0.09;
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - np / 2);
      k.box('newels', p.rail, np, h + 0.03, np, x, (h + 0.03) / 2, 0, { r: 0.006, segs: 2 });
      k.box('newels', p.rail, np + 0.02, 0.03, np + 0.02, x, h + 0.045, 0, { r: 0.006, segs: 2 });
      k.lathe('newels', p.rail, [[0, 0], [0.03, 0], [0.034, 0.02], [0.02, 0.04], [0.035, 0.07], [0, 0.1]], x, h + 0.06, 0, { smooth: 12, segs: k.seg(16, 6) });
    }
    const inner = L - 2 * np;
    k.box('spindles', p.spindles, inner, 0.04, 0.06, 0, 0.06, 0, { r: 0.004 });
    profileX(k, 'rail', p.rail, [[-0.032, 0], [0.032, 0], [0.035, 0.02], ...arc(0, 0.035, 0.035, -0.2, Math.PI + 0.2, 10).map(([z, y]) => [z, y + 0.005]).slice(1, -1), [-0.035, 0.02]], inner, h - 0.075, { bevel: 0.001 });
    const nb = Math.max(2, Math.round(inner / 0.12)), sh = h - 0.075 - 0.08;
    const prof = [[0, 0], [0.018, 0], [0.018, 0.07], [0.012, 0.09], [0.016, 0.11], [0.011, 0.14], [0.009, sh * 0.6], [0.014, sh * 0.72], [0.01, sh * 0.8], [0.014, sh - 0.06], [0.018, sh - 0.05], [0.018, sh], [0, sh]];
    for (let i = 0; i < nb; i++) k.lathe('spindles', p.spindles, prof, -inner / 2 + (inner * (i + 0.5)) / nb, 0.08, 0, { segs: k.seg(12, 5) });
    return k.group();
  },
});

const railIron = item({
  id: 'st-railing-iron', category: 'structure', ko: '단조 철 난간', en: 'Wrought iron railing', size: [2.0, 0.98, 0.05],
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.6, 6),
    P.len('height', '높이', 'Height', 0.95, 0.8, 1.1),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
  ],
  tags: ['wrought iron', 'iron railing', 'scroll railing', 'balcony railing', '단조 난간', '철 난간', '발코니 난간', '난간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height, m = p.metal;
    for (const sx of [-1, 1]) {
      k.box('posts', m, 0.04, h, 0.04, sx * (L / 2 - 0.02), h / 2, 0, { r: 0.003 });
      k.sphere('posts', m, 0.026, sx * (L / 2 - 0.02), h + 0.02, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    }
    k.box('posts', m, L, 0.012, 0.045, 0, h - 0.006, 0, { r: 0.003 });
    k.box('posts', m, L - 0.06, 0.02, 0.02, 0, h - 0.04, 0, { r: 0.002 });
    k.box('posts', m, L - 0.06, 0.02, 0.02, 0, 0.08, 0, { r: 0.002 });
    const n = Math.max(3, Math.round((L - 0.08) / 0.12)), step = (L - 0.08) / n;
    for (let i = 1; i < n; i++) k.box('bars', m, 0.014, h - 0.13, 0.014, -L / 2 + 0.04 + i * step, 0.09 + (h - 0.13) / 2, 0, { r: 0.0015 });
    // S/C scrolls in every other bay, twisted collars on the bars
    const cy = 0.09 + (h - 0.13) / 2;
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const cx = -L / 2 + 0.04 + (i + 0.5) * step;
      for (const s of [-1, 1]) {
        const pts = [];
        const N = k.hi ? 24 : 10, R = step * 0.42;
        for (let j = 0; j <= N; j++) { const t = j / N, a = t * Math.PI * 1.7, rr = R * (1 - t * 0.7); pts.push([cx + s * Math.sin(a) * rr * 0.9, cy + s * (R - Math.cos(a) * rr), 0]); }
        k.tube('bars', m, pts, 0.005, { radial: k.seg(6, 4), segs: k.seg(28, 10) });
      }
    }
    for (let i = 1; i < n; i++) k.box('bars', m, 0.024, 0.03, 0.024, -L / 2 + 0.04 + i * step, cy, 0, { r: 0.004 });
    return k.group();
  },
});

const wallRail = item({
  id: 'st-wall-handrail', category: 'structure', placement: 'wall', elevation: 0.82, ko: '벽 부착 핸드레일', en: 'Wall-mounted handrail', size: [2.0, 0.1, 0.09],
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.5, 6),
    P.mat('rail', '손잡이', 'Rail', 'wood-oak'),
    P.mat('metal', '브래킷', 'Brackets', 'metal-steel', 'metal'),
    P.bool('returns', '벽쪽 마감 꺾음', 'Wall returns', true),
  ],
  tags: ['handrail', 'wall handrail', 'grab rail', 'stair rail', '핸드레일', '벽 손잡이', '계단 손잡이', '안전 손잡이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, zw = -0.045, zr = zw + 0.065, yr = 0.07, r = 0.022;
    if (p.returns) k.bentTube('rail', p.rail, [[-L / 2, yr, zw + 0.002], [-L / 2, yr, zr], [L / 2, yr, zr], [L / 2, yr, zw + 0.002]], r, 0.05, { radial: k.seg(16, 6), segs: k.seg(80, 16) });
    else k.rod('rail', p.rail, [-L / 2, yr, zr], [L / 2, yr, zr], r, { segs: k.seg(16, 6) });
    const nb = Math.max(2, Math.round(L / 1.1) + 1);
    for (let i = 0; i < nb; i++) {
      const x = -L / 2 + 0.2 + (L - 0.4) * (i / (nb - 1));
      k.cyl('brackets', p.metal, 0.03, 0.03, 0.008, x, 0.03, zw, { rx: Math.PI / 2, segs: k.seg(20, 8) });
      k.bentTube('brackets', p.metal, [[x, 0.03, zw + 0.008], [x, 0.03, zr - 0.005], [x, yr - r, zr]], 0.006, 0.012, { radial: k.seg(8, 4) });
    }
    centreKit(k);
    return k.group();
  },
});

export const PART1 = [nicheArched, nicheShelves, beamTimber, beamSteel, beamBoxed, columnDoric, columnIonic, columnSteel, columnMushroom, columnBrick, archWall, halfWall, wainscotRaised, boardBatten, acousticSlats, spiral, floating, stairsU, ladder, mono, railSpindle, railIron, wallRail];

/* ----------------------------------------------------------------- ceilings */

const coffer = item({
  id: 'st-ceiling-coffer', category: 'structure', placement: 'ceiling', elevation: 2.2, ko: '격자 우물천장(코퍼)', en: 'Coffered ceiling grid', size: [3.0, 0.2, 3.0],
  params: [
    P.len('width', '폭', 'Width', 3.0, 1.0, 8),
    P.len('depth', '깊이', 'Depth', 3.0, 1.0, 8),
    P.len('bay', '격자 간격', 'Bay size', 1.0, 0.5, 2.0),
    P.len('height', '보 춤', 'Beam depth', 0.2, 0.08, 0.4),
    P.mat('finish', '마감', 'Finish', 'paint-white-matte'),
    P.mat('inner', '격자 안쪽', 'Coffer panels', 'wall-paint-sage', 'wall'),
  ],
  tags: ['coffered ceiling', 'coffer', 'ceiling grid', 'waffle ceiling', '우물천장', '격자 천장', '코퍼 천장', '천장 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, h = p.height, bw = 0.14, st = 0.045;
    const nx = Math.max(1, Math.round(W / p.bay)), nz = Math.max(1, Math.round(D / p.bay));
    const xs = Array.from({ length: nx + 1 }, (_, i) => -W / 2 + bw / 2 + (W - bw) * (i / nx));
    const zs = Array.from({ length: nz + 1 }, (_, i) => -D / 2 + bw / 2 + (D - bw) * (i / nz));
    for (const x of xs) k.box('beams', p.finish, bw, h, D, x, h / 2, 0, { r: 0.004, segs: 2 });
    for (const z of zs) for (let i = 0; i < nx; i++) k.box('beams', p.finish, xs[i + 1] - xs[i] - bw, h, bw, (xs[i] + xs[i + 1]) / 2, h / 2, z, { r: 0.004, segs: 2 });
    // stepped inner frame at the top of every bay + a recessed panel
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2, iw = xs[i + 1] - xs[i] - bw, id = zs[j + 1] - zs[j] - bw;
      const y = h - 0.012 - st / 2;
      for (const s of [-1, 1]) {
        k.box('beams', p.finish, iw, st, st, cx, y, cz + s * (id / 2 - st / 2), { r: 0.003 });
        k.box('beams', p.finish, st, st, id - 2 * st, cx + s * (iw / 2 - st / 2), y, cz, { r: 0.003 });
      }
      k.box('panels', p.inner, iw, 0.01, id, cx, h - 0.007, cz, { r: 0 });
    }
    return k.group();
  },
});

const medallion = item({
  id: 'st-ceiling-medallion', category: 'structure', placement: 'ceiling', elevation: 2.35, ko: '천장 메달리온(로제트)', en: 'Ceiling medallion', size: [0.6, 0.05, 0.6],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.6, 0.3, 1.2),
    P.int('petals', '꽃잎 수', 'Petals', 12, 6, 24),
    P.mat('finish', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['ceiling medallion', 'ceiling rose', 'rosette', 'plaster', '천장 메달리온', '로제트', '천장 장식', '석고 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = 0.05, n = p.petals, r1 = 0.07, r2 = R * 0.8;
    const prof = [[0, 0], [0.03, 0], [0.04, 0.006], [0.036, 0.016], [0.055, 0.02], [r1, 0.026]];
    for (let i = 1; i < 9; i++) { const t = i / 9; prof.push([r1 + (r2 - r1) * t, H - 0.014 - 0.016 * Math.sin(Math.PI * t)]); }
    prof.push([r2, H - 0.014], [R * 0.85, H - 0.01], [R * 0.9, H - 0.02], [R * 0.95, H - 0.02], [R, H - 0.008], [R, H], [0, H]);
    latheMod(k, 'medallion', p.finish, prof, k.seg(n * 8, n * 3), (r, th, y) => {
      if (r <= r1 || r >= r2) return [r, y];
      const t = (r - r1) / (r2 - r1);
      return [r, y - 0.009 * Math.max(0, Math.cos(n * th)) ** 2 * Math.sin(Math.PI * t)];
    });
    return k.group();
  },
});

const soffit = item({
  id: 'st-soffit', category: 'structure', placement: 'ceiling', elevation: 2.05, ko: '천장 박스(주방 소핏)', en: 'Kitchen soffit bulkhead', size: [2.4, 0.355, 0.45],
  params: [
    P.len('length', '길이', 'Length', 2.4, 0.6, 6),
    P.len('depth', '깊이', 'Depth', 0.45, 0.25, 0.8),
    P.len('drop', '내림 높이', 'Drop', 0.35, 0.15, 0.6),
    P.mat('finish', '마감', 'Finish', 'wall-paint-white', 'wall'),
    P.bool('lights', '매립등', 'Downlights', true),
  ],
  tags: ['soffit', 'bulkhead', 'kitchen soffit', 'dropped ceiling', '소핏', '천장 박스', '주방 천장', '매립등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.drop;
    k.box('box', p.finish, L, h, d, 0, h / 2, 0, { r: 0.003, segs: 2 });
    // shadow-gap reveal where it meets the ceiling
    k.box('reveal', 'paint-grey-matte', L - 0.004, 0.012, d - 0.02, 0, h + 0.006 - 0.001, -0.01, { r: 0 });
    if (p.lights) {
      const n = Math.max(1, Math.round(L / 0.8));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (L / n) * (i + 0.5);
        k.cyl('trim', 'metal-white', 0.04, 0.04, 0.004, x, -0.003, d * 0.1, { segs: k.seg(24, 8) });
        k.cyl('lamp', 'light-warm', 0.028, 0.028, 0.002, x, -0.0035, d * 0.1, { segs: k.seg(20, 8) });
        k.light(x, -0.05, d * 0.1, { intensity: 0.5, distance: 3, type: 'spot', angle: 0.6 });
      }
    }
    centreKit(k);
    return k.group();
  },
});

/* ---------------------------------------------------------------- radiators */

const radPanel = item({
  id: 'st-radiator-panel', category: 'structure', placement: 'wall', elevation: 0.15, ko: '패널 라디에이터', en: 'Panel radiator', size: [1.044, 0.604, 0.077],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.4, 2.0),
    P.len('height', '높이', 'Height', 0.6, 0.3, 0.9),
    P.mat('finish', '도장', 'Finish', 'paint-white-gloss'),
  ],
  tags: ['radiator', 'panel radiator', 'heater', 'convector', '라디에이터', '방열기', '난방기', '패널 히터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, m = p.finish;
    // two pressed panels with vertical channels, convector gap between, top grille and side covers
    for (const z of [-0.025, 0.025]) {
      k.box('panels', m, W, H, 0.012, 0, H / 2, z, { r: 0.004 });
      const n = Math.max(4, Math.round(W / 0.05));
      for (let i = 0; i < n; i++) k.box('panels', m, W / n - 0.008, H - 0.06, 0.008, -W / 2 + (W / n) * (i + 0.5), H / 2, z + Math.sign(z) * 0.009, { r: 0.0035 });
    }
    for (let i = 0; i < 6; i++) k.box('panels', m, W - 0.02, 0.004, 0.006, 0, H + 0.002, -0.03 + i * 0.012, { r: 0.001 });
    for (const s of [-1, 1]) k.box('panels', m, 0.004, H - 0.01, 0.07, s * (W / 2 - 0.002), H / 2, 0, { r: 0.001 });
    k.cyl('valve', 'metal-chrome', 0.011, 0.011, 0.05, W / 2 + 0.02, 0.0, 0.015, { segs: k.seg(14, 6) });
    k.rod('valve', 'metal-chrome', [W / 2 - 0.005, 0.03, 0.015], [W / 2 + 0.02, 0.03, 0.015], 0.008, { segs: k.seg(10, 5) });
    k.cyl('knob', 'plastic-white', 0.024, 0.024, 0.06, W / 2 + 0.02, 0.05, 0.015, { segs: k.seg(16, 6) });
    centreKit(k);
    return k.group();
  },
});

const radColumn = item({
  id: 'st-radiator-column', category: 'structure', ko: '주철 컬럼 라디에이터', en: 'Column radiator', size: [0.66, 0.75, 0.16],
  params: [
    P.int('sections', '섹션 수', 'Sections', 10, 4, 30),
    P.len('height', '높이', 'Height', 0.75, 0.4, 1.8),
    P.mat('finish', '도장', 'Finish', 'paint-white-gloss'),
  ],
  tags: ['column radiator', 'cast iron radiator', 'radiator', 'heater', '컬럼 라디에이터', '주철 라디에이터', '방열기', '난방기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.sections, pitch = 0.06, W = n * pitch, H = p.height, m = p.finish, feet = 0.09;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + pitch * (i + 0.5);
      const y0 = i === 0 || i === n - 1 ? 0 : feet;
      if (y0 === 0) k.box('body', m, 0.05, feet + 0.02, 0.15, x, (feet + 0.02) / 2, 0, { r: 0.008, segs: 2 });
      // three tubes per section between rounded headers
      for (const z of [-0.045, 0, 0.045]) k.cyl('body', m, 0.019, 0.019, H - feet - 0.1, x, feet + 0.05, z, { segs: k.seg(14, 6) });
      for (const y of [feet + 0.03, H - 0.03]) k.rbox('body', m, 0.052, 0.06, 0.14, 0.024, x, y, 0, { segs: k.hi ? 2 : 1 });
    }
    k.rod('body', m, [-W / 2 + 0.01, feet + 0.03, 0], [W / 2 - 0.01, feet + 0.03, 0], 0.012, { segs: k.seg(12, 5) });
    k.rod('valve', 'metal-brass', [W / 2 - 0.01, H - 0.03, 0], [W / 2 + 0.04, H - 0.03, 0], 0.012, { segs: k.seg(12, 5) });
    k.cyl('valve', 'metal-brass', 0.02, 0.02, 0.03, W / 2 + 0.03, H - 0.03, 0, { segs: k.seg(12, 5) });
    centreKit(k);
    return k.group();
  },
});

/* ---------------------------------------------------------------- mouldings */

const chairRail = item({
  id: 'st-chair-rail', category: 'structure', placement: 'wall', elevation: 0.9, ko: '체어레일·픽처레일 몰딩', en: 'Chair / picture rail', size: [1.0, 0.07, 0.029],
  params: [
    P.len('length', '길이', 'Length', 1.0, 0.1, 6),
    P.pick('profile', '단면', 'Profile', 'chair', [['chair', '체어 레일', 'Chair rail'], ['picture', '픽처 레일', 'Picture rail'], ['dado', '평 몰딩', 'Flat dado']]),
    P.mat('material', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['chair rail', 'picture rail', 'dado rail', 'moulding', '체어레일', '픽처레일', '몰딩', '걸레받이 몰딩'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const zb = -0.0125;
    let pts;
    if (p.profile === 'picture') pts = [[zb, 0], [0.002, 0], [0.002, 0.006], [0.012, 0.014], [0.012, 0.036], ...arc(0.006, 0.036, 0.006, 0, Math.PI / 2, 4).slice(1), [-0.002, 0.042], [-0.002, 0.034], [zb + 0.004, 0.034], [zb + 0.004, 0.05], [zb, 0.05]];
    else if (p.profile === 'dado') pts = [[zb, 0], [0, 0], [0.006, 0.006], [0.006, 0.054], [0, 0.06], [zb, 0.06]];
    else pts = [[zb, 0], [0, 0], [0.004, 0.006], [0.004, 0.022], ...arc(0.004, 0.034, 0.012, -Math.PI / 2, Math.PI / 2, 8).slice(1, -1), [0.004, 0.046], [0, 0.05], [0.008, 0.062], [0.008, 0.07], [zb, 0.07]];
    profileX(k, 'moulding', p.material, pts, p.length, 0, { bevel: 0.0006 });
    centreKit(k, { y: false });
    return k.group();
  },
});

const dentil = item({
  id: 'st-cornice-dentil', category: 'structure', placement: 'wall', elevation: 2.22, ko: '덴틸 코니스 몰딩', en: 'Dentil cornice', size: [1.0, 0.18, 0.16],
  params: [
    P.len('length', '길이', 'Length', 1.0, 0.2, 6),
    P.mat('material', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['dentil', 'cornice', 'crown moulding', 'classical', '덴틸', '코니스', '천장 몰딩', '고전 몰딩'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, zb = -0.08;
    const pts = [[zb, 0], [zb + 0.03, 0], [zb + 0.03, 0.01], [zb + 0.04, 0.02], [zb + 0.04, 0.07], [zb + 0.09, 0.07], [zb + 0.09, 0.1], ...arc(zb + 0.16, 0.1, 0.07, Math.PI, Math.PI / 2, 10).slice(1), [zb + 0.16, 0.18], [zb, 0.18]];
    profileX(k, 'moulding', p.material, pts, L, 0, { bevel: 0.0008 });
    const n = Math.max(2, Math.floor((L - 0.02) / 0.045));
    for (let i = 0; i < n; i++) k.box('moulding', p.material, 0.026, 0.04, 0.03, -((n - 1) * 0.045) / 2 + i * 0.045, 0.05, zb + 0.055, { r: 0.001 });
    return k.group();
  },
});

/* ------------------------------------------------------------- floor items */

const steps = item({
  id: 'st-floor-steps', category: 'structure', ko: '거실 단차 계단', en: 'Sunken-floor steps', size: [2.0, 0.34, 0.64],
  params: [
    P.len('width', '폭', 'Width', 2.0, 0.6, 6),
    P.int('count', '단 수', 'Steps', 2, 1, 4),
    P.len('rise', '단 높이', 'Riser', 0.17, 0.1, 0.2),
    P.len('tread', '디딤 깊이', 'Tread', 0.32, 0.25, 0.45),
    P.mat('top', '디딤판', 'Treads', 'wood-oak', 'wood'),
    P.mat('riser', '챌판', 'Risers', 'paint-white-matte'),
    P.bool('led', '단 LED', 'Step LEDs', true),
  ],
  tags: ['steps', 'floor step', 'sunken living room', 'step lighting', '단차', '거실 계단', '단 계단', '계단 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, n = p.count, r = p.rise, t = p.tread, D = n * t, tt = 0.025, nose = 0.015;
    for (let i = 1; i <= n; i++) {
      const zf = D / 2 - (i - 1) * t, depth = zf + D / 2;
      k.box('risers', p.riser, W, r - tt, depth - 0.0, 0, (i - 1) * r + (r - tt) / 2, zf - depth / 2, { r: 0.002 });
      k.box('treads', p.top, W, tt, depth + nose, 0, i * r - tt / 2, zf - depth / 2 + nose / 2, { r: 0.004, segs: 2 });
      if (p.led) {
        k.box('led', 'light-warm', W - 0.04, 0.004, 0.01, 0, i * r - tt - 0.003, zf - 0.006, { r: 0 });
        k.light(0, i * r - tt - 0.03, zf + 0.05, { intensity: 0.25, distance: 1.5 });
      }
    }
    centreKit(k);
    return k.group();
  },
});

const maru = item({
  id: 'st-maru', category: 'structure', ko: '대청마루', en: 'Korean maru floor', size: [2.655, 0.45, 2.376],
  params: [
    P.len('width', '폭', 'Width', 2.4, 1.2, 5),
    P.len('depth', '깊이', 'Depth', 1.8, 1.0, 4),
    P.len('height', '높이', 'Height', 0.45, 0.3, 0.7),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
    P.bool('step', '댓돌', 'Step stone', true),
  ],
  tags: ['maru', 'korean floor', 'hanok', 'raised floor', '대청마루', '마루', '한옥', '우물마루', '평상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = p.height, bh = 0.1, bw = 0.12, wd = p.wood;
    // stone footings (주춧돌) + round posts
    const px = Math.max(1, Math.round(W / 1.2)), rand = rng(7);
    for (let i = 0; i <= px; i++) for (const sz of [-1, 1]) {
      const x = -W / 2 + bw / 2 + (W - bw) * (i / px), z = sz * (D / 2 - bw / 2);
      k.rbox('stones', 'granite-grey', 0.28 + rand() * 0.04, 0.12, 0.26 + rand() * 0.04, 0.03, x, 0.06, z, { segs: 2, ry: rand() * 0.4 });
      k.cyl('posts', wd, 0.06, 0.065, H - bh - 0.12 + 0.002, x, 0.12 - 0.001, z, { segs: k.seg(16, 6) });
    }
    // 장귀틀 (perimeter) + 동귀틀 (cross beams) with 청판 boards between
    for (const sz of [-1, 1]) k.box('beams', wd, W, bh, bw, 0, H - bh / 2, sz * (D / 2 - bw / 2), { r: 0.006, segs: 2 });
    const nb = Math.max(2, Math.round(W / 0.45));
    const xs = Array.from({ length: nb + 1 }, (_, i) => -W / 2 + bw / 2 + (W - bw) * (i / nb));
    for (const x of xs) k.box('beams', wd, bw * 0.9, bh, D - 2 * bw, x, H - bh / 2, 0, { r: 0.006, segs: 2 });
    const nBoards = Math.max(2, Math.round((D - 2 * bw) / 0.28)), bdep = (D - 2 * bw) / nBoards;
    for (let i = 0; i < nb; i++) for (let j = 0; j < nBoards; j++) {
      const bwid = xs[i + 1] - xs[i] - bw * 0.9;
      k.box('boards', wd, bwid - 0.004, 0.03, bdep - 0.004, (xs[i] + xs[i + 1]) / 2, H - 0.016, -D / 2 + bw + bdep * (j + 0.5), { r: 0.003 });
    }
    if (p.step) k.rbox('stones', 'granite-grey', Math.min(1.0, W * 0.4), 0.2, 0.42, 0.04, 0, 0.1, D / 2 + 0.25, { segs: 2 });
    centreKit(k);
    return k.group();
  },
});

const benchNook = item({
  id: 'st-bench-nook', category: 'structure', ko: '붙박이 벤치(창가 누크)', en: 'Built-in bench nook', size: [1.6, 0.98, 0.55],
  params: [
    P.len('width', '폭', 'Width', 1.6, 0.8, 3.0),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('fabric', '방석', 'Cushion', 'fabric-linen-beige', 'fabric'),
    P.mat('pillows', '쿠션', 'Pillows', 'fabric-mustard', 'fabric'),
    P.bool('drawers', '서랍', 'Drawers', true),
  ],
  tags: ['bench nook', 'window seat', 'built-in bench', 'banquette', '벤치 누크', '창가 벤치', '붙박이 벤치', '수납 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, d = 0.5, h = 0.4, bp = 0.03;
    addCabinet(k, { w: W, h, d, z: bp / 2, rows: [{ h: 1, n: Math.max(1, Math.round(W / 0.6)), type: p.drawers ? 'drawer' : 'door' }], body: p.body, front: p.body, handle: 'cup', handleMat: 'metal-brass', base: 'plinth', plinth: 0.06 });
    // board-and-batten back panel
    k.box('back', p.body, W, 0.98, bp, 0, 0.49, -d / 2, { r: 0.003 });
    const nbat = Math.max(2, Math.round(W / 0.3) + 1);
    for (let i = 0; i < nbat; i++) k.box('back', p.body, 0.05, 0.98 - h - 0.1 - 0.04, 0.012, -W / 2 + 0.025 + (W - 0.05) * (i / (nbat - 1)), h + 0.08 + (0.98 - h - 0.14) / 2, -d / 2 + bp / 2 + 0.006, { r: 0.002 });
    k.box('back', p.body, W + 0.02, 0.025, 0.08, 0, 0.98 - 0.0125, -d / 2 + 0.02, { r: 0.004 });
    k.soft('cushion', p.fabric, W - 0.02, 0.07, d - bp - 0.01, 0.025, 0, h + 0.035, bp / 2 + 0.0, { puff: 0.012, sag: 0.006 });
    const np = Math.max(1, Math.round(W / 0.55));
    for (let i = 0; i < np; i++) {
      const g = pillowGeo(0.45, 0.4, 0.13, k.hi ? 14 : 6);
      g.rotateX(-0.22);
      g.translate(-W / 2 + (W / np) * (i + 0.5), h + 0.07 + 0.2, -d / 2 + bp / 2 + 0.11);
      k.add('pillows', p.pillows, g);
    }
    centreKit(k);
    return k.group();
  },
});

/* ------------------------------------------------------- stoves & fireplaces */

const stove = item({
  id: 'st-wood-stove', category: 'structure', ko: '장작 난로(연통)', en: 'Wood-burning stove', size: [0.56, 2.4, 0.48],
  params: [
    P.len('flue', '연통 높이', 'Flue height', 2.4, 1.2, 3.5),
    P.mat('body', '본체', 'Body', 'metal-black', 'metal'),
    P.bool('fire', '불꽃', 'Fire', true),
  ],
  tags: ['wood stove', 'wood burner', 'log burner', 'flue', '장작 난로', '화목 난로', '벽난로', '연통'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.5, H = 0.55, D = 0.42, leg = 0.14, m = p.body, y0 = leg, t = 0.012;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('body', m, 0.018, 0.012, leg, sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.05), { segs: k.seg(12, 6) });
    // box body (bottom, sides, back, top plate with overhang); door frame and glass on the front
    k.box('body', m, W, t, D, 0, y0 + t / 2, 0, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('body', m, t, H, D, sx * (W / 2 - t / 2), y0 + H / 2, 0, { r: 0.003 });
    k.box('body', m, W, H, t, 0, y0 + H / 2, -D / 2 + t / 2, { r: 0.003 });
    k.box('body', m, W + 0.04, 0.02, D + 0.04, 0, y0 + H + 0.01, 0, { r: 0.006, segs: 2 });
    k.panel('body', m, frameShape(W, H, 0.06, 0.07, 0.004), 0.025, 0, y0 + H / 2, D / 2 - 0.0125, { bevel: 0.003 });
    k.box('glass', 'glass-tinted', W - 0.11, H - 0.13, 0.005, 0, y0 + H / 2, D / 2 - 0.016, { r: 0 });
    k.box('firebrick', 'wall-brick-red', W - 2 * t - 0.002, H - 0.06, 0.02, 0, y0 + H / 2, -D / 2 + t + 0.011, { r: 0 });
    k.rod('handle', 'metal-steel', [W / 2 - 0.05, y0 + H * 0.35, D / 2 + 0.002], [W / 2 - 0.05, y0 + H * 0.65, D / 2 + 0.002], 0.007, { segs: 6 });
    k.box('body', m, W - 0.04, 0.02, 0.03, 0, y0 + 0.02, D / 2 + 0.01, { r: 0.004 }); // ash lip
    // flue collar + pipe up to the ceiling
    const top = y0 + H + 0.02;
    k.cyl('flue', m, 0.085, 0.085, 0.04, 0, top, -0.05, { segs: k.seg(24, 8) });
    k.cyl('flue', m, 0.075, 0.075, Math.max(0.2, p.flue - top), 0, top, -0.05, { segs: k.seg(24, 8) });
    for (const fy of [0.5, 1.1]) if (top + fy < p.flue - 0.05) k.cyl('flue', m, 0.079, 0.079, 0.02, 0, top + fy, -0.05, { segs: k.seg(24, 8) });
    if (p.fire) addFire(k, 0, y0 + t, -0.03, W - 0.14, H - 0.2, { logs: 2, scaleZ: 0.5 });
    centreKit(k, { y: false });
    return k.group();
  },
});

const stoneFireplace = item({
  id: 'st-fireplace-stone', category: 'structure', ko: '석조 벽난로(굴뚝벽)', en: 'Stone fireplace & chimney breast', size: [1.6, 2.4, 0.92],
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.0, 3.0),
    P.len('height', '높이(천장까지)', 'Height (to ceiling)', 2.4, 1.8, 3.5),
    P.mat('stone', '석재', 'Stone', 'wall-brick-white'),
    P.mat('mantel', '맨틀 보', 'Mantel beam', 'wood-dark', 'wood'),
    P.bool('fire', '불꽃', 'Fire', true),
  ],
  tags: ['stone fireplace', 'chimney breast', 'hearth', 'rustic fireplace', '석조 벽난로', '굴뚝', '벽난로', '맨틀'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.5, ow = Math.min(0.9, W * 0.55), oh = 0.7, oy = 0.12;
    const s = new THREE.Shape([new THREE.Vector2(-W / 2, -H / 2), new THREE.Vector2(W / 2, -H / 2), new THREE.Vector2(W / 2, H / 2), new THREE.Vector2(-W / 2, H / 2)]);
    const y0 = oy - H / 2;
    s.holes.push(new THREE.Path([new THREE.Vector2(-ow / 2, y0), new THREE.Vector2(-ow / 2, y0 + oh), new THREE.Vector2(ow / 2, y0 + oh), new THREE.Vector2(ow / 2, y0)]));
    k.panel('stone', p.stone, s, D, 0, H / 2, 0, { bevel: 0.006 });
    // chunky timber mantel beam with a raised stone hearth slab
    k.box('mantel', p.mantel, ow + 0.6, 0.2, D * 0.5 + 0.08, 0, oy + oh + 0.1, D / 2 - (D * 0.5 + 0.08) / 2 + 0.08, { r: 0.012, segs: 2 });
    k.box('hearth', 'granite-grey', ow + 0.7, 0.12, 0.42, 0, 0.06, D / 2 + 0.21 - 0.02, { r: 0.01, segs: 2 });
    const fbD = D - 0.08;
    k.box('firebox', 'paint-black-matte', ow, oh, 0.02, 0, oy + oh / 2, -fbD / 2 + 0.01, { r: 0 });
    for (const sx of [-1, 1]) k.box('firebox', 'paint-black-matte', 0.02, oh, fbD, sx * (ow / 2 - 0.01), oy + oh / 2, 0, { r: 0 });
    k.box('firebox', 'paint-black-matte', ow, 0.02, fbD, 0, oy + 0.01, 0, { r: 0 });
    k.box('firebox', 'paint-black-matte', ow, 0.02, fbD, 0, oy + oh - 0.01, 0, { r: 0 });
    // fire dogs (andirons)
    for (const sx of [-1, 1]) k.box('firebox', 'metal-black', 0.02, 0.1, 0.25, sx * 0.18, oy + 0.07, 0.02, { r: 0.004 });
    if (p.fire) addFire(k, 0, oy + 0.03, -0.02, ow - 0.1, oh - 0.15, { logs: 3 });
    centreKit(k);
    return k.group();
  },
});

/* ------------------------------------------------------------------ screens */

const shoji = item({
  id: 'st-shoji-partition', category: 'structure', ko: '창호지 격자 칸막이', en: 'Shoji lattice partition', size: [1.8, 2.1, 0.04],
  params: [
    P.len('width', '폭', 'Width', 1.8, 0.6, 4),
    P.len('height', '높이', 'Height', 2.1, 1.2, 2.6),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
    P.pick('fill', '창호 재질', 'Panels', 'paper', [['paper', '창호지', 'Rice paper'], ['frosted', '불투명 유리', 'Frosted glass']]),
  ],
  tags: ['shoji', 'lattice screen', 'paper screen', 'hanji', 'room divider', '창호지', '창살', '칸막이', '한지 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, n = Math.max(1, Math.round(W / 0.9)), pw = W / n, f = 0.04, kick = 0.25;
    const fill = p.fill === 'paper' ? 'paper' : 'glass-frosted';
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + pw * (i + 0.5);
      k.panel('frame', p.wood, frameShape(pw - 0.004, H, f), 0.035, cx, H / 2, 0, { bevel: 0.002 });
      k.box('frame', p.wood, pw - 2 * f, kick, 0.016, cx, f + kick / 2 - 0.002, 0, { r: 0.002 });
      k.box('frame', p.wood, pw - 2 * f, 0.025, 0.03, cx, f + kick + 0.0125 - 0.002, 0, { r: 0.002 });
      const y0 = f + kick + 0.023, y1 = H - f, cols = Math.max(2, Math.round((pw - 2 * f) / 0.2)), rows = Math.max(3, Math.round((y1 - y0) / 0.24));
      for (let c = 1; c < cols; c++) k.box('lattice', p.wood, 0.012, y1 - y0, 0.02, cx - pw / 2 + f + ((pw - 2 * f) * c) / cols, (y0 + y1) / 2, 0.004, { r: 0.001 });
      for (let r = 1; r < rows; r++) k.box('lattice', p.wood, pw - 2 * f, 0.012, 0.02, cx, y0 + ((y1 - y0) * r) / rows, 0.004, { r: 0.001 });
      k.box('fill', fill, pw - 2 * f + 0.006, y1 - y0 + 0.006, 0.002, cx, (y0 + y1) / 2, -0.008, { r: 0 });
    }
    return k.group();
  },
});

/* ----------------------------------------------------------------- variants */

const VARIANTS = [
  variant(base('column'), 'concrete-square', '콘크리트 사각 기둥', 'Square concrete column', { shape: 'square', material: 'concrete', trim: false, size: 0.4 }, { tags: ['concrete', '콘크리트', 'square', '사각'] }),
  variant(base('stairs'), 'l-glass', 'ㄱ자 유리난간 계단', 'L-shaped stairs, glass rail', { type: 'l', rail: 'glass', tread: 'wood-walnut' }, { tags: ['glass', '유리 난간', 'l-shaped', 'ㄱ자'] }),
  variant(base('fireplace'), 'mantel-travertine', '트래버틴 맨틀 벽난로', 'Travertine mantel fireplace', { style: 'mantel', surround: 'travertine' }, { tags: ['travertine', '트래버틴', 'mantel', '클래식'] }),
  variant(base('railing'), 'cable', '와이어 난간', 'Cable railing', { style: 'cable', rail: 'wood-walnut' }, { tags: ['cable railing', '와이어 난간', 'wire', '와이어'] }),
  variant(base('partition-panel'), 'steel-glass', '철제 유리 파티션', 'Steel & glass partition', { style: 'glass' }, { tags: ['steel glass', '철제 유리', 'crittall', '중문'] }),
  variant(base('baseboard'), 'classic-tall', '클래식 높은 걸레받이', 'Tall classic skirting', { profile: 'classic', height: 0.15 }, { tags: ['tall skirting', '높은 걸레받이', 'classic', '클래식'] }),
  variant(archWall, 'pointed', '첨두 아치 벽', 'Pointed-arch wall', { style: 'pointed', finish: 'wall-paint-warm' }, { tags: ['gothic arch', '고딕 아치', 'pointed', '첨두'] }),
  variant(radColumn, 'cast-iron', '블랙 주철 라디에이터', 'Black cast-iron radiator', { finish: 'metal-black', sections: 14 }, { tags: ['cast iron', '주철', 'black', '블랙'] }),
  variant(spiral, 'white', '화이트 나선형 계단', 'White spiral staircase', { tread: 'wood-white', metal: 'metal-white' }, { tags: ['white', '화이트', 'scandinavian', '북유럽'] }),
];

export const ITEMS = [...PART1, coffer, medallion, soffit, radPanel, radColumn, chairRail, dentil, steps, maru, benchNook, stove, stoneFireplace, shoji, ...VARIANTS];
void clamp;
