// Structure & finishing: columns, beams, stairs, railings, mouldings, cove, partitions, platform, fireplace.
import { THREE, Kit, item, P, frameShape, roundRect } from './helpers.js';
import { planShape } from './office.js';
import { stairLayout, stairInfo, sideRuns, railSidesOf, RAIL_HEIGHT, GUARD_HEIGHT } from '../../engine/stairs.js';

/** A profile given as [z, y] points (z towards the room) extruded along x over `len`, centred. */
export function profileX(k, role, mat, pts, len, y0 = 0, o = {}) {
  // panel() extrudes along z; after ry = +90° shape x maps to world −z, so feed (−z, y).
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  return k.panel(role, mat, shape, len, 0, y0, 0, { ry: Math.PI / 2, bevel: o.bevel ?? 0.0015, curveSegs: o.curveSegs ?? 12, ...o });
}

/** Points of an arc (centre cz, cy) from angle a0 to a1 (radians, in the z/y plane). */
export function arc(cz, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

/* ------------------------------------------------------------- columns */

const column = item({
  id: 'column', category: 'structure', ko: '기둥', en: 'Column', size: [0.42, 2.4, 0.42],
  params: [
    // Columns are structure (src/engine/planedit.js): walls join their centre, the 2D plan shows them cut.
    P.pick('shape', '모양', 'Shape', 'round', [['round', '원형', 'Round'], ['square', '정사각', 'Square'], ['rect', '직사각', 'Rectangular']]),
    P.len('size', '폭·지름', 'Width / diameter', 0.35, 0.1, 1.5),
    P.len('depth', '깊이 (직사각)', 'Depth (rectangular)', 0.6, 0.1, 1.5),
    P.bool('fitLevel', '층 높이에 맞춤', 'Fit the level height', false),
    P.len('height', '높이', 'Height', 2.4, 1.0, 6.0),
    P.mat('material', '마감', 'Finish', 'paint-white-matte'),
    P.bool('trim', '받침·머리 장식', 'Base & capital', true),
  ],
  tags: ['column', 'pillar', 'post', 'structure', '기둥', '원형 기둥', '사각 기둥', '구조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, h = p.height, tr = p.trim ? Math.min(0.12, s * 0.3) : 0;
    if (p.shape === 'rect') {
      const d = p.depth;
      k.box('shaft', p.material, s, h - 2 * tr, d, 0, h / 2, 0, { r: 0.004 });
      if (p.trim) for (const y of [tr / 2, h - tr / 2]) k.box('trim', p.material, s + 0.05, tr, d + 0.05, 0, y, 0, { r: 0.006, segs: 2 });
      return k.group();
    }
    if (p.shape === 'round') {
      const r = s / 2;
      if (p.trim) {
        // plinth block + torus-like base and a matching capital
        k.box('trim', p.material, s + 0.06, 0.04, s + 0.06, 0, 0.02, 0, { r: 0.004 });
        k.lathe('trim', p.material, [[0, 0.04], [r + 0.025, 0.04], [r + 0.028, 0.06], [r + 0.012, 0.09], [r + 0.004, 0.1], [r, 0.11], [0, 0.11]], 0, 0, 0, { smooth: 14, segs: k.seg(40, 12) });
        k.lathe('trim', p.material, [[0, h - 0.11], [r, h - 0.11], [r + 0.006, h - 0.1], [r + 0.02, h - 0.07], [r + 0.03, h - 0.045], [r + 0.03, h - 0.04], [0, h - 0.04]], 0, 0, 0, { smooth: 14, segs: k.seg(40, 12) });
        k.box('trim', p.material, s + 0.07, 0.04, s + 0.07, 0, h - 0.02, 0, { r: 0.004 });
      }
      k.cyl('shaft', p.material, r * 0.985, r, h - 2 * (p.trim ? 0.11 : 0), 0, p.trim ? 0.11 : 0, 0, { segs: k.seg(40, 12) });
    } else {
      k.box('shaft', p.material, s, h - 2 * tr, s, 0, h / 2, 0, { r: 0.004 });
      if (p.trim) for (const [y, gw] of [[tr / 2, 0.05], [h - tr / 2, 0.05]]) {
        k.box('trim', p.material, s + gw, tr, s + gw, 0, y, 0, { r: 0.006, segs: 2 });
        k.box('trim', p.material, s + gw * 0.5, 0.02, s + gw * 0.5, 0, y + (y < h / 2 ? tr / 2 + 0.01 : -tr / 2 - 0.01), 0, { r: 0.004 });
      }
    }
    return k.group();
  },
});

const beam = item({
  // Origin = bottom centre of the beam (CONTRACT); `elevation` is the default height of its underside.
  id: 'beam', category: 'structure', placement: 'ceiling', elevation: 2.1, ko: '보(빔)', en: 'Beam', size: [3.0, 0.3, 0.25],
  params: [
    P.len('length', '길이', 'Length', 3.0, 0.5, 10),
    P.len('width', '폭', 'Width', 0.25, 0.1, 0.6),
    P.len('height', '춤(높이)', 'Depth', 0.3, 0.1, 0.8),
    P.mat('material', '마감', 'Finish', 'wood-oak'),
  ],
  tags: ['beam', 'ceiling beam', 'joist', '보', '빔', '천장 보', '서까래'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('beam', p.material, p.length, p.height, p.width, 0, p.height / 2, 0, { r: 0.006, segs: 2 });
    return k.group();
  },
});

/* ---------------------------------------------------------------- stairs */

/**
 * One flight in local space: starts at z = 0 (first riser) and climbs towards −z, x ∈ [−w/2, w/2].
 * count treads, tread i (1..count) top at i·rh. rails: [] | ['left'] | ['right'] | both.
 */
export function flight(k, { w, count, rh, run, tread, riser, string, rail, rails }) {
  const nose = 0.025, tt = 0.04, st = 0.045;
  const L = count * run;
  for (let i = 1; i <= count; i++) {
    const zc = -(i - 0.5) * run;
    k.box('treads', tread, w - 2 * st + 0.01, tt, run + nose, 0, i * rh - tt / 2, zc + nose / 2, { r: 0.004, segs: 2 });
    k.box('risers', riser, w - 2 * st, rh - tt, 0.018, 0, (i - 1) * rh + (rh - tt) / 2, -(i - 1) * run - 0.009, { r: 0.001 });
  }
  // closed strings on both sides, following the nosing line
  const top = count * rh;
  const pts = [[0.0, 0], [0.0, rh + 0.06], [-(L - run), top + 0.06], [-L, top + 0.06], [-L, top - 0.28], [Math.min(-0.05, -L + (top - 0.28) * run / rh), 0]];
  for (const s of [-1, 1]) profileX(k, 'strings', string, pts.map(([z, y]) => [z, y]), st, 0, { x: 0 }) && moveLast(k, 'strings', string, s * (w / 2 - st / 2));
  const height = 0.9;
  for (const side of rails) {
    const x = (side === 'left' ? -1 : 1) * (w / 2 - st / 2);
    if (rail === 'glass') {
      // glass balustrade standing on the string, steel cap rail
      const gpts = [[-0.05, rh + 0.06], [-(L - run * 0.5), top + 0.06], [-(L - run * 0.5), top + height - 0.04], [-0.05, rh + height - 0.04]];
      const shape = new THREE.Shape(gpts.map(([z, y]) => new THREE.Vector2(-z, y)));
      k.panel('glass', 'glass-clear', shape, 0.012, x, 0, 0, { ry: Math.PI / 2, bevel: 0.001, curveSegs: 2 });
      k.rod('rail', 'metal-steel', [x, rh + height, -0.03], [x, top + height, -(L - run * 0.5)], 0.022, { segs: k.seg(14, 6) });
    } else if (rail === 'baluster') {
      for (let i = 1; i <= count; i++) {
        const z = -(i - 0.5) * run;
        k.box('balusters', 'metal-black', 0.016, height, 0.016, x, i * rh + height / 2, z, { r: 0.002 });
      }
      k.box('balusters', 'metal-black', 0.06, height + 0.06, 0.06, x, rh + (height + 0.06) / 2, -run * 0.5 + 0.05, { r: 0.006, segs: 2 });
      const a = [x, rh + height + 0.02, -0.0], b = [x, top + height + 0.02, -(L - run * 0.5)];
      const len = Math.hypot(b[1] - a[1], b[2] - a[2]);
      k.box('rail', tread, 0.06, 0.04, len, x, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { r: 0.012, segs: 2, rx: Math.atan2(b[1] - a[1], -(b[2] - a[2])) });
    }
  }
}

/** Moves the last geometry of a part sideways (profileX builds at x = 0). */
export function moveLast(k, role, mat, dx) {
  for (const p of k.parts.values()) if (p.role === role && p.mat === mat) { p.geos[p.geos.length - 1].translate(dx, 0, 0); return; }
}

/** Faces of a solid band along a plan polyline: per point a bottom and a top height, `thick` across (both sides drawn). */
function bandGeo(pts, bottoms, tops, thick) {
  const pos = [];
  const n = pts.length;
  const nrm = miterNormals(pts);
  const L = pts.map((q, i) => [q[0] + nrm[i][0] * thick / 2, q[1] + nrm[i][1] * thick / 2]);
  const R = pts.map((q, i) => [q[0] - nrm[i][0] * thick / 2, q[1] - nrm[i][1] * thick / 2]);
  const v = (q, y) => [q[0], y, q[1]];
  const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c); };
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1;
    quad(v(L[i], bottoms[i]), v(L[j], bottoms[j]), v(L[j], tops[j]), v(L[i], tops[i]));
    quad(v(R[i], bottoms[i]), v(R[j], bottoms[j]), v(R[j], tops[j]), v(R[i], tops[i]));
    quad(v(L[i], tops[i]), v(L[j], tops[j]), v(R[j], tops[j]), v(R[i], tops[i]));
    quad(v(L[i], bottoms[i]), v(L[j], bottoms[j]), v(R[j], bottoms[j]), v(R[i], bottoms[i]));
  }
  for (const i of [0, n - 1]) quad(v(L[i], bottoms[i]), v(R[i], bottoms[i]), v(R[i], tops[i]), v(L[i], tops[i]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Unit normals at the points of a plan polyline (left of travel: (−dz, dx)), mitred at the corners. */
function miterNormals(pts) {
  const seg = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0]; const dz = pts[i + 1][1] - pts[i][1]; const l = Math.hypot(dx, dz) || 1;
    seg.push([-dz / l, dx / l]);
  }
  return pts.map((_, i) => {
    const a = seg[Math.max(0, i - 1)]; const b = seg[Math.min(seg.length - 1, i)];
    const m = [a[0] + b[0], a[1] + b[1]]; const ml = Math.hypot(m[0], m[1]);
    if (ml < 1e-6) return b;
    const cos = (m[0] * b[0] + m[1] * b[1]) / ml;
    const s = 1 / Math.max(0.5, cos);
    return [(m[0] / ml) * s, (m[1] / ml) * s];
  });
}

/** A polyline [[x, z, y]…] moved sideways by `d` (positive: to the left of travel). */
function offsetRun(run, d) {
  const nrm = miterNormals(run);
  return run.map((q, i) => [q[0] + nrm[i][0] * d, q[1] + nrm[i][1] * d, q[2]]);
}

/** A run with a point added where `y − depth` crosses 0 (so a string's soffit meets the floor on the pitch). */
function withFloorPoint(run, depth) {
  const out = [run[0]];
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]; const b = run[i];
    const fa = a[2] - depth; const fb = b[2] - depth;
    if ((fa < 0) !== (fb < 0) && Math.abs(fb - fa) > 1e-9) {
      const t = -fa / (fb - fa);
      if (t > 0.01 && t < 0.99) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
    out.push(b);
  }
  return out;
}

const runLength = (run) => run.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - run[i - 1][0], q[1] - run[i - 1][1]) : 0), 0);
/** The point at distance `t` along a run (with its height). */
function along(run, t) {
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]; const b = run[i]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (t <= l || i === run.length - 1) { const f = l > 0 ? Math.min(1, t / l) : 0; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
    t -= l;
  }
  return run.at(-1);
}

const railSegs = (k, run) => k.seg(Math.max(8, Math.round(runLength(run) * 16 + run.length * 2)), 4);

/** Handrail with balusters or glass along a run of [x, z, y] (y = the line the rail follows, `h` above it). */
function balustrade(k, run, { style, h, railMat, base, newels = true }) {
  const top = run.map((q) => [q[0], q[2] + h, q[1]]);
  if (style === 'glass') {
    k.add('glass', 'glass-clear', bandGeo(run.map((q) => [q[0], q[1]]), run.map((q) => base(q)), run.map((q) => q[2] + h - 0.035), 0.012));
    k.tube('rail', 'metal-steel', top, 0.022, { caps: true, tension: 0, segs: railSegs(k, run) });
    return;
  }
  const len = runLength(run);
  const count = Math.max(1, Math.ceil(len / 0.12));
  for (let i = 1; i < count; i++) {
    const q = along(run, (len * i) / count);
    const y0 = base(q); const y1 = q[2] + h - 0.02;
    if (y1 - y0 > 0.05) k.box('balusters', 'metal-black', 0.016, y1 - y0, 0.016, q[0], (y0 + y1) / 2, q[1], { r: 0.002 });
  }
  if (newels) for (const q of [run[0], run.at(-1)]) {
    const y0 = Math.max(0, base(q) - 0.02); const y1 = q[2] + h + 0.05;
    k.box('balusters', 'metal-black', 0.05, y1 - y0, 0.05, q[0], (y0 + y1) / 2, q[1], { r: 0.004, segs: 2 });
  }
  k.tube('rail', railMat, top, 0.026, { caps: true, tension: 0, segs: railSegs(k, run) });
}

const STAIR_TYPE_OPTIONS = [['straight', '일자', 'Straight'], ['l', 'ㄱ자 (참)', 'L-shaped (landing)'], ['winder', 'ㄱ자 (돌음 계단)', 'L-shaped (winders)'], ['u', 'U자 (중간참·되돌아 오름)', 'U / switchback (half landing)'], ['spiral', '원형 (나선)', 'Spiral'], ['curved', '곡선 (원형 계단실)', 'Curved (open well)']];
const isType = (...types) => (v) => types.includes(v.type);

const stairs = item({
  id: 'stairs', category: 'structure', ko: '계단', en: 'Stairs', size: stairLayout({}).size,
  params: [
    P.pick('type', '형태', 'Type', 'straight', STAIR_TYPE_OPTIONS),
    P.len('rise', '층고(전체 높이)', 'Total rise', 2.6, 0.5, 6.0),
    { ...P.len('width', '폭', 'Width', 0.9, 0.6, 2.0), showIf: (v) => v.type !== 'spiral' },
    { ...P.len('run', '디딤판 깊이', 'Tread run', 0.26, 0.22, 0.35), showIf: (v) => !['spiral', 'curved'].includes(v.type) },
    P.len('maxRiser', '최대 단 높이', 'Max riser', 0.19, 0.15, 0.21),
    P.pick('turn', '꺾임/난간 방향', 'Turn / rail side', 'left', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
    { ...P.len('landing', '참 깊이 (0 = 폭)', 'Landing depth (0 = width)', 0, 0, 3.0), showIf: isType('l', 'u') },
    { ...P.len('gap', '계단 사이 틈', 'Gap between flights', 0.1, 0, 0.5), showIf: isType('u') },
    { ...P.num('angle', '회전 각도 (°)', 'Turn angle (°)', 360, 180, 540, 15), showIf: isType('spiral', 'curved') },
    { ...P.len('diameter', '바깥 지름', 'Outer diameter', 1.6, 1.2, 3.0), showIf: isType('spiral') },
    { ...P.len('innerRadius', '안쪽 반지름', 'Inner radius', 0.5, 0.2, 2.0), showIf: isType('curved') },
    P.pick('rail', '난간', 'Handrail', 'baluster', [['glass', '유리', 'Glass'], ['baluster', '난간살', 'Balusters'], ['none', '없음', 'None']]),
    P.pick('railSides', '난간 위치', 'Handrail sides', 'auto', [['auto', '자동 (열린 쪽)', 'Auto (open side)'], ['inner', '안쪽', 'Inner'], ['outer', '바깥쪽', 'Outer'], ['both', '양쪽', 'Both']]),
    P.pick('risers', '챌판', 'Risers', 'closed', [['closed', '막힘', 'Closed'], ['open', '열림 (챌판 없음)', 'Open']]),
    P.bool('guard', '위층 계단실 난간', 'Guard rail round the opening above', false),
    P.bool('stairwell', '위층 바닥 뚫기', 'Cut the floor above', true),
    P.mat('tread', '디딤판', 'Treads', 'wood-oak', 'wood'),
    P.mat('riser', '챌판·옆판', 'Risers & strings', 'paint-white-matte'),
  ],
  tags: ['stairs', 'staircase', 'steps', 'switchback', 'spiral', 'winder', '계단', '일자 계단', 'ㄱ자 계단', 'U자 계단', '돌음 계단', '나선 계단', '원형 계단', '난간'],
  sizeOf: (params) => stairLayout(params).size,
  info: (params) => stairInfo(params),
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = stairLayout(p);
    const rh = L.riser; const spiral = L.type === 'spiral';
    const tt = spiral ? 0.05 : 0.04; const nose = spiral ? 0 : 0.025; const st = 0.045; const depth = 0.28;
    // Treads (nosing over the riser line) and landings (a deeper body under a tread-finish top).
    for (const s of L.steps) {
      const cx = s.poly.reduce((a, q) => a + q[0], 0) / s.poly.length; const cz = s.poly.reduce((a, q) => a + q[1], 0) / s.poly.length;
      let poly = s.poly;
      let out = null;
      if (s.front) {
        const [a, b] = s.front; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        out = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
        if ((cx - a[0]) * out[0] + (cz - a[1]) * out[1] > 0) out = [-out[0], -out[1]];
        if (nose && !s.landing) poly = poly.map((q) => (s.front.some((f) => Math.hypot(f[0] - q[0], f[1] - q[1]) < 1e-6) ? [q[0] + out[0] * nose, q[1] + out[1] * nose] : q));
      }
      if (s.landing && !s.platform) {
        k.slab('strings', p.riser, planShape(s.poly), 0.2 - tt, s.y - 0.2, { bevel: 0.002 });
      }
      k.slab('treads', p.tread, planShape(poly), s.platform ? 0.06 : tt, s.y - (s.platform ? 0.06 : tt), { bevel: 0.003 });
      // Riser under the front edge (from the tread below up to this tread).
      if (s.front && (p.risers !== 'open' || s.landing)) {
        const [a, b] = s.front;
        const back = [-out[0] * 0.009, -out[1] * 0.009];
        k.add('risers', p.riser, bandGeo([[a[0] + back[0], a[1] + back[1]], [b[0] + back[0], b[1] + back[1]]], [s.y - rh, s.y - rh], [s.y - tt, s.y - tt], 0.018));
      }
    }
    // The last riser, onto the floor above.
    if (L.exit && L.exitRiser && p.risers !== 'open') {
      const last = L.steps.at(-1).poly; const cx = last.reduce((a, q) => a + q[0], 0) / last.length; const cz = last.reduce((a, q) => a + q[1], 0) / last.length;
      const { a, b } = L.exit; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let away = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      if ((cx - a[0]) * away[0] + (cz - a[1]) * away[1] > 0) away = [-away[0], -away[1]];
      const off = [away[0] * 0.009, away[1] * 0.009];
      k.add('risers', p.riser, bandGeo([[a[0] + off[0], a[1] + off[1]], [b[0] + off[0], b[1] + off[1]]], [L.rise - rh, L.rise - rh], [L.rise, L.rise], 0.018));
    }
    // Closed strings on both sides of every flight, following the pitch line (and round the landings).
    for (const side of L.sides) {
      if (side.stringer === false) continue;
      for (const run of sideRuns(side.pts)) {
        const r = withFloorPoint(offsetRun(run, side.in * st / 2), depth);
        k.add('strings', p.riser, bandGeo(r.map((q) => [q[0], q[1]]), r.map((q) => Math.max(0, q[2] - depth)), r.map((q) => q[2] + 0.05), st));
      }
    }
    // Supports under landings, the central wall of a tight switchback, the spiral's pole.
    for (const q of L.posts) k.box('strings', p.riser, 0.08, q.y - 0.2, 0.08, q.x, (q.y - 0.2) / 2, q.z, { r: 0.004 });
    if (L.spine) k.add('strings', p.riser, bandGeo(L.spine.pts.map((q) => [q[0], q[1]]), L.spine.pts.map(() => 0), L.spine.pts.map((q) => q[2]), L.spine.thick));
    if (L.pole) {
      k.cyl('pole', 'metal-steel', L.pole.r, L.pole.r, L.pole.h, L.pole.x, 0, L.pole.z, { segs: k.seg(24, 8) });
      k.sphere('pole', 'metal-steel', L.pole.r * 1.2, L.pole.x, L.pole.h, L.pole.z, { segs: k.seg(16, 6), rings: k.seg(10, 4) });
    }
    // Handrails on the open sides.
    if (p.rail !== 'none') {
      for (const side of railSidesOf(L, p.railSides)) {
        for (const run of sideRuns(side.pts)) {
          const r = offsetRun(run, side.in * (side.stringer === false ? 0.04 : st / 2));
          // Balusters stand on the string, or on the treads where there is none (spiral).
          const base = side.stringer === false ? (q) => Math.min(L.rise, Math.max(rh, Math.floor(q[2] / rh + 1e-6) * rh)) : (q) => q[2] + 0.05;
          balustrade(k, r, { style: p.rail, h: RAIL_HEIGHT, railMat: p.tread, base });
        }
      }
    }
    // Guard rail round the opening in the floor above (fixed to the slab edge).
    if (p.guard) {
      for (const line of L.guard) {
        if (line.length < 2) continue;
        const run = line.map((q) => [q[0], q[1], L.rise]);
        balustrade(k, run, { style: p.rail === 'glass' ? 'glass' : 'baluster', h: GUARD_HEIGHT, railMat: p.tread, base: () => L.rise - 0.15, newels: true });
        for (let i = 1; i < run.length - 1; i++) k.box('balusters', 'metal-black', 0.05, GUARD_HEIGHT + 0.2, 0.05, run[i][0], L.rise - 0.15 + (GUARD_HEIGHT + 0.2) / 2, run[i][1], { r: 0.004, segs: 2 });
      }
    }
    return k.group();
  },
});

/* --------------------------------------------------------------- railing */

const railing = item({
  id: 'railing', category: 'structure', ko: '난간', en: 'Railing', size: [2.0, 1.0, 0.07],
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.5, 6),
    P.len('height', '높이', 'Height', 1.0, 0.8, 1.2),
    P.pick('style', '형태', 'Style', 'glass', [['glass', '유리', 'Glass'], ['baluster', '난간살', 'Balusters'], ['cable', '와이어', 'Cable']]),
    P.mat('rail', '손잡이', 'Handrail', 'wood-oak'),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
  ],
  tags: ['railing', 'balustrade', 'handrail', '난간', '유리 난간', '핸드레일'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height;
    if (p.style === 'glass') {
      // aluminium base shoe, frameless glass panes with 10 mm joints, cap rail
      k.box('shoe', 'metal-aluminium', L, 0.1, 0.06, 0, 0.05, 0, { r: 0.004, segs: 2 });
      const n = Math.max(1, Math.round(L / 1.0)), pw = (L - (n - 1) * 0.01) / n;
      for (let i = 0; i < n; i++) k.box('glass', 'glass-clear', pw, h - 0.13, 0.012, -L / 2 + pw / 2 + i * (pw + 0.01), 0.07 + (h - 0.13) / 2, 0, { r: 0.002 });
      k.box('rail', p.rail, L, 0.045, 0.06, 0, h - 0.0225, 0, { r: 0.012, segs: 2 });
    } else {
      const posts = Math.max(2, Math.round(L / 1.2) + 1);
      for (let i = 0; i < posts; i++) k.box('posts', p.metal, 0.05, h - 0.04, 0.05, -L / 2 + 0.025 + (L - 0.05) * (i / (posts - 1)), (h - 0.04) / 2, 0, { r: 0.004, segs: 2 });
      if (p.style === 'baluster') {
        k.box('posts', p.metal, L, 0.03, 0.03, 0, 0.09, 0, { r: 0.003 });
        const nb = Math.round(L / 0.11);
        for (let i = 1; i < nb; i++) k.box('posts', p.metal, 0.016, h - 0.15, 0.016, -L / 2 + (L * i) / nb, 0.09 + (h - 0.15) / 2, 0, { r: 0.002 });
      } else {
        for (let j = 0; j < 9; j++) k.rod('cables', 'metal-steel', [-L / 2 + 0.03, 0.12 + j * (h - 0.2) / 9, 0], [L / 2 - 0.03, 0.12 + j * (h - 0.2) / 9, 0], 0.0025, { segs: 5 });
      }
      k.box('rail', p.rail, L, 0.045, 0.07, 0, h - 0.0225, 0, { r: 0.012, segs: 2 });
    }
    return k.group();
  },
});

/* -------------------------------------------------------------- mouldings */

const baseboard = item({
  id: 'baseboard', category: 'structure', placement: 'wall', elevation: 0, ko: '걸레받이', en: 'Baseboard', size: [1.0, 0.08, 0.014],
  params: [
    P.len('length', '길이', 'Length', 1.0, 0.1, 6),
    P.len('height', '높이', 'Height', 0.08, 0.04, 0.2),
    P.pick('profile', '단면', 'Profile', 'modern', [['modern', '모던(평판)', 'Modern (flat)'], ['classic', '클래식', 'Classic'], ['shadow', '섀도우갭', 'Shadow gap']]),
    P.mat('material', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['baseboard', 'skirting', 'moulding', '걸레받이', '몰딩', '굽도리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, t = 0.014, b = -t / 2, f = t / 2;
    let pts;
    if (p.profile === 'classic') pts = [[b, 0], [f, 0], [f, h * 0.62], ...arc(f - 0.005, h * 0.62, 0.005, 0, Math.PI / 2, 4), [f - 0.006, h * 0.7], ...arc(b + 0.003, h * 0.7, f - 0.006 - b - 0.003, 0, Math.PI / 2, 6), [b, h]];
    else if (p.profile === 'shadow') pts = [[b, 0], [f - 0.006, 0], [f - 0.006, 0.01], [f, 0.01], [f, h - 0.002], [f - 0.002, h], [b, h]];
    else pts = [[b, 0], [f, 0], [f, h - 0.003], [f - 0.003, h], [b, h]];
    profileX(k, 'baseboard', p.material, pts, p.length, 0, { bevel: 0.0008 });
    return k.group();
  },
});

const crown = item({
  id: 'crown-moulding', category: 'structure', placement: 'wall', elevation: 2.3, ko: '천장 몰딩', en: 'Crown moulding', size: [1.0, 0.1, 0.1],
  params: [
    P.len('length', '길이', 'Length', 1.0, 0.1, 6),
    P.len('size', '크기', 'Size', 0.1, 0.04, 0.2),
    P.mat('material', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['crown moulding', 'cornice', 'cove moulding', '천장 몰딩', '갈매기 몰딩', '크라운'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, b = -s / 2, f = s / 2;
    // back against the wall (−z), top against the ceiling; concave cove face between small fillets
    const pts = [[b, 0], [b + 0.012, 0], [b + 0.012, 0.008], ...arc(f, 0, f - (b + 0.012), Math.PI, Math.PI / 2, 12).map(([z, y]) => [Math.min(z, f - 0.008), Math.max(y, 0.008)]), [f - 0.008, s - 0.008], [f, s - 0.008], [f, s], [b, s]];
    profileX(k, 'moulding', p.material, pts, p.length, 0, { bevel: 0.0008 });
    return k.group();
  },
});

const cove = item({
  id: 'ceiling-cove', category: 'structure', placement: 'ceiling', elevation: 2.25, ko: '간접조명 천장 박스', en: 'Ceiling light cove', size: [2.0, 0.15, 0.22],
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.5, 8),
    P.len('depth', '깊이', 'Depth', 0.22, 0.12, 0.4),
    P.len('drop', '내림 높이', 'Drop', 0.15, 0.08, 0.3),
    P.mat('material', '마감', 'Finish', 'wall-paint-white', 'wall'),
    P.bool('led', 'LED', 'LED strip', true),
  ],
  tags: ['light cove', 'ceiling cove', 'indirect lighting', '간접조명', '우물천장', '커튼박스', '천장 박스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.drop, t = 0.012;
    // a gypsum L-section: soffit board + low upstand lip that hides the LED strip
    k.box('cove', p.material, L, t, d, 0, t / 2, 0, { r: 0.002 });
    k.box('cove', p.material, L, h, t, 0, h / 2, d / 2 - t / 2, { r: 0.002 });
    k.box('cove', p.material, L, 0.05, t, 0, t + 0.025, -d / 2 + 0.03 + t / 2, { r: 0.0015 });
    if (p.led) {
      k.box('led', 'light-warm', L - 0.02, 0.006, 0.012, 0, t + 0.003, -d / 2 + 0.055, { r: 0 });
      const n = Math.max(1, Math.round(L / 1.5));
      for (let i = 0; i < n; i++) k.light(-L / 2 + (L / n) * (i + 0.5), t + 0.02, -d / 2 + 0.06, { intensity: 0.4, distance: 2.5 });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- partition */

const partition = item({
  id: 'partition-panel', category: 'structure', ko: '파티션 벽', en: 'Partition panel', size: [1.2, 2.4, 0.06],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.4, 4),
    P.len('height', '높이', 'Height', 2.4, 1.0, 3.0),
    P.pick('style', '형태', 'Style', 'slats', [['slats', '원목 루버', 'Wood slats'], ['glass', '철제 유리', 'Steel & glass'], ['solid', '가벽', 'Solid wall']]),
    P.mat('material', '재질', 'Material', 'wood-oak'),
  ],
  tags: ['partition', 'room divider', 'screen', '파티션', '가벽', '루버', '칸막이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height;
    if (p.style === 'slats') {
      // vertical slats (40 × 40) at 80 mm pitch between a floor and a ceiling rail
      k.box('rails', p.material, w, 0.03, 0.06, 0, 0.015, 0, { r: 0.003 });
      k.box('rails', p.material, w, 0.03, 0.06, 0, h - 0.015, 0, { r: 0.003 });
      const n = Math.max(2, Math.floor(w / 0.08));
      for (let i = 0; i < n; i++) k.box('slats', p.material, 0.04, h - 0.06, 0.04, -w / 2 + 0.02 + (w - 0.04) * (i / (n - 1)), h / 2, 0, { r: 0.004, segs: 2 });
    } else if (p.style === 'glass') {
      const cols = Math.max(1, Math.round(w / 0.45)), rows = Math.max(2, Math.round(h / 0.6));
      const f = 0.035;
      k.panel('frame', 'metal-black', frameShape(w, h, f), 0.045, 0, h / 2, 0, { bevel: 0.002 });
      for (let i = 1; i < cols; i++) k.box('frame', 'metal-black', 0.02, h - 2 * f, 0.035, -w / 2 + (w * i) / cols, h / 2, 0, { r: 0.002 });
      for (let j = 1; j < rows; j++) k.box('frame', 'metal-black', w - 2 * f, 0.02, 0.035, 0, (h * j) / rows, 0, { r: 0.002 });
      k.box('glass', 'glass-clear', w - 2 * f + 0.01, h - 2 * f + 0.01, 0.008, 0, h / 2, 0, { r: 0 });
    } else {
      k.box('wall', 'wall-paint-white', w, h, 0.1, 0, h / 2, 0, { r: 0.004 });
      k.box('trim', 'paint-white-matte', w + 0.002, 0.08, 0.114, 0, 0.04, 0, { r: 0.002 });
    }
    return k.group();
  },
});

/* -------------------------------------------------------------- platform */

const platform = item({
  id: 'platform', category: 'structure', ko: '단(평상)', en: 'Raised platform', size: [2.0, 0.3, 1.6],
  params: [
    P.len('width', '폭', 'Width', 2.0, 0.6, 5),
    P.len('depth', '깊이', 'Depth', 1.6, 0.6, 4),
    P.len('height', '높이', 'Height', 0.3, 0.1, 0.6),
    P.mat('top', '상판', 'Top', 'floor-oak', 'floor'),
    P.mat('body', '몸체', 'Body', 'paint-white-matte'),
    P.bool('drawers', '수납 서랍', 'Drawers', true),
  ],
  tags: ['platform', 'raised floor', 'stage', '단', '평상', '마루', '수납 단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p, t = 0.025;
    k.box('body', p.body, w - 0.02, h - t, d - 0.02, 0, (h - t) / 2, -0.01, { r: 0.002 });
    // plank top: boards along x with 2 mm joints and a rounded nosing all round
    const pw = 0.19, n = Math.max(1, Math.round(d / pw)), bw = d / n;
    for (let i = 0; i < n; i++) k.box('top', p.top, w, t, bw - 0.002, 0, h - t / 2, -d / 2 + bw * (i + 0.5), { r: 0.003 });
    if (p.drawers && h >= 0.2) {
      const nd = Math.max(1, Math.round(w / 0.7)), dw = (w - 0.02) / nd;
      for (let i = 0; i < nd; i++) {
        const cx = -w / 2 + 0.01 + dw * (i + 0.5);
        k.box('fronts', p.body, dw - 0.004, h - t - 0.03, 0.018, cx, (h - t) / 2 + 0.01, d / 2 - 0.009, { r: 0.002 });
        k.box('handles', 'paint-black-matte', Math.min(0.3, dw * 0.5), 0.006, 0.004, cx, h - t - 0.03, d / 2 + 0.0005, { r: 0 });
      }
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- fireplace */

const fireplace = item({
  id: 'fireplace', category: 'structure', ko: '벽난로', en: 'Fireplace', size: [1.6, 1.15, 0.4],
  params: [
    P.pick('style', '형태', 'Style', 'modern', [['modern', '모던 일자형', 'Modern linear'], ['mantel', '클래식 맨틀', 'Classic mantel']]),
    P.len('width', '폭', 'Width', 1.6, 1.0, 3.0),
    P.len('height', '높이', 'Height', 1.15, 0.9, 1.5),
    P.mat('surround', '마감', 'Surround', 'marble-white', 'stone'),
    P.bool('fire', '불꽃', 'Fire', true),
  ],
  tags: ['fireplace', 'hearth', 'mantel', '벽난로', '난로', '맨틀피스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.4;
    const ow = p.style === 'modern' ? w * 0.68 : Math.min(0.9, w * 0.55), oh = p.style === 'modern' ? 0.36 : Math.min(0.75, h * 0.6);
    const oy = p.style === 'modern' ? h * 0.32 : 0.12;
    // surround = a slab with the firebox opening cut out
    // square outer corners: tiny rounded corners (dense near-duplicate points) broke the hole triangulation
    const s = roundRect(w, h, 0);
    const hole = new THREE.Path();
    const x0 = -ow / 2, y0 = oy - h / 2;
    hole.moveTo(x0, y0); hole.lineTo(x0, y0 + oh); hole.lineTo(x0 + ow, y0 + oh); hole.lineTo(x0 + ow, y0); hole.lineTo(x0, y0);
    s.holes.push(hole);
    if (p.style === 'modern') {
      k.panel('surround', p.surround, s, d, 0, h / 2, 0, { bevel: 0.004 });
    } else {
      const bodyD = d - 0.08;
      k.panel('surround', p.surround, s, bodyD, 0, h / 2, -0.04, { bevel: 0.004 });
      // mantel shelf, pilasters and hearth slab
      k.box('surround', p.surround, w + 0.1, 0.06, d, 0, h - 0.03, 0, { r: 0.008, segs: 2 });
      k.box('surround', p.surround, w + 0.04, 0.04, d - 0.04, 0, h - 0.08, -0.02, { r: 0.006, segs: 2 });
      for (const sx of [-1, 1]) k.box('surround', p.surround, 0.14, h - 0.12, 0.05, sx * (ow / 2 + 0.12), (h - 0.12) / 2, bodyD / 2 - 0.015, { r: 0.006, segs: 2 });
      k.box('hearth', 'marble-black', ow + 0.5, 0.04, 0.2, 0, 0.02, d / 2 - 0.1, { r: 0.006, segs: 2 });
    }
    // dark firebox (back + floor), glass front on the modern one
    const fbD = p.style === 'modern' ? d - 0.06 : d - 0.14;
    const fbZ = p.style === 'modern' ? -0.02 : -0.06;
    k.box('firebox', 'paint-black-matte', ow, oh, 0.02, 0, oy + oh / 2, fbZ - fbD / 2 + 0.01, { r: 0 });
    for (const sx of [-1, 1]) k.box('firebox', 'paint-black-matte', 0.02, oh, fbD, sx * (ow / 2 - 0.01), oy + oh / 2, fbZ, { r: 0 });
    k.box('firebox', 'paint-black-matte', ow, 0.02, fbD, 0, oy + 0.01, fbZ, { r: 0 });
    k.box('firebox', 'paint-black-matte', ow, 0.02, fbD, 0, oy + oh - 0.01, fbZ, { r: 0 });
    if (p.style === 'modern') k.box('glass', 'glass-tinted', ow, oh, 0.006, 0, oy + oh / 2, d / 2 - 0.02, { r: 0 });
    if (p.fire) {
      // logs + emissive flame tongues + a light marker for the glow
      const logs = p.style === 'modern' ? 3 : 2;
      for (let i = 0; i < logs; i++) {
        const lx = (i - (logs - 1) / 2) * Math.min(0.28, ow / (logs + 0.5));
        k.rod('logs', 'wood-dark', [lx - 0.13, oy + 0.06, fbZ + 0.02 * (i % 2 ? 1 : -1)], [lx + 0.13, oy + 0.05, fbZ - 0.02 * (i % 2 ? 1 : -1)], 0.035, { segs: k.seg(10, 5) });
      }
      const flames = Math.max(3, Math.round(ow / 0.12));
      for (let i = 0; i < flames; i++) {
        const fx = -ow / 2 + 0.06 + (ow - 0.12) * (i / (flames - 1));
        const fh = Math.min(oh - 0.1, 0.09 + 0.07 * Math.abs(Math.sin(i * 2.3)));
        // soft orange tongues (an orange emissive tint keeps them from clipping to white)
        k.lathe('flame', 'light-warm', [[0, 0], [0.045, 0.015], [0.04, fh * 0.35], [0.018, fh * 0.75], [0, fh]], fx, oy + 0.04, fbZ + 0.01, { smooth: 10, segs: k.seg(10, 5), scale: [1, 1, 0.35], overrides: { color: '#ffb060', emissive: '#ff7a1a', emissiveIntensity: 1.6 } });
      }
      k.light(0, oy + 0.2, fbZ + 0.05, { color: '#ff9a4a', intensity: 1.2, distance: 5 });
    }
    return k.group();
  },
});

export const ITEMS = [column, beam, stairs, railing, baseboard, crown, cove, partition, platform, fireplace];
