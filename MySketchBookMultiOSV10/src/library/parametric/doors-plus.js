// Even more doors (placement 'opening'): period and speciality hinged doors (studded plank,
// Art Deco sunburst, Craftsman, Victorian stained glass, cane, mirror, chalkboard, slim aluminium,
// invisible flush, toilet cubicle, hospital, fire exit pair, cold room, sauna, storm screen,
// security grille, vault, ship bulkhead, gothic), entrance doors (Korean glass-strip and smart
// doors, transom, double with sidelights, steel gate, carriage-house garage), Korean 중문
// (swing, 3-panel telescopic, automatic), shower doors (hinged, sliding, bifold, pivot), sliding
// systems (wall-hung glass, lift-and-slide, OXXO, telescopic pocket, engawa, 세살 미닫이, bi-parting
// barn, glass-top barn, automatic bi-parting), revolving door, overhead doors (roller shutter,
// tilt-up garage) and doorways without a leaf (moon gate, bead curtain, noren).
// Same conventions as openings.js: origin = bottom centre of the wall hole (params width /
// height = hole size), z = 0 the wall's mid plane, +Z the room side. Moving hinged leaves keep
// their geometry in mesh role 'leaf' (fixed sidelights use other roles) so the plan swing
// (src/engine/doorswing.js) matches the 3D leaf. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, OPT, clamp, roundRect, shellGeo, frameShape } from './helpers.js';
import {
  DEG, wallT, withMatrix, pivot, ring, doorFrame, addLever, linings, slidePanel, shiftRole,
  JAMB, DOOR_SLACK, hingeParam, openParam,
} from './openings.js';
import { hingedDoor, specLeaf, doorCommon, autoSize, archCircle, arcPts, spandrelShape, archBand } from './doors-more.js';

const GAP = 0.003;
const PI = Math.PI;
const M4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);
const RY = (a) => new THREE.Matrix4().makeRotationY(a);

/* ------------------------------------------------------------------ helpers */

/** Runs fn(zc) with the parts placed on a leaf hinged at (hx, y0, zFace) and opened by angle (side −1: opens to −Z). */
function swingAt(k, { hx, dir, zFace, angle, lt, side = 1, y0 = 0.008 }, fn) {
  const m = pivot(0, 0, 0, { ry: -dir * side * angle });
  m.premultiply(M4(hx, y0, zFace));
  withMatrix(k, m, () => fn(-side * lt / 2));
}

/** Hinge barrels on a leaf's hinge edge. */
function barrels(k, X, lh, z, mat, n = 3, r = 0.008) {
  const ys = n === 2 ? [0.25, lh - 0.25] : [0.22, lh / 2 + 0.1, lh - 0.25];
  for (const hy of ys) if (hy < lh) k.cyl('hardware', mat, r, r, 0.1, X(-0.004), hy - 0.05, z, { segs: k.seg(12, 6) });
}

/** Runs fn() and moves the 'leaf' parts it added to another role (fixed sidelights built with specLeaf). */
function asRole(k, role, fn) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  fn();
  for (const [key, p] of [...k.parts]) {
    if (p.role !== 'leaf') continue;
    const from = before.get(key) ?? 0;
    if (p.geos.length <= from) continue;
    const moved = p.geos.splice(from);
    if (!p.geos.length) k.parts.delete(key);
    for (const g of moved) k.add(role, p.mat, g, { overrides: p.overrides, uv: 'keep' });
  }
}

/** The y ranges of the rows of a specLeaf spec (same maths as specLeaf). */
function rowYs(rows, lh) {
  const fixed = rows.reduce((a, r) => a + (r.rail ?? r.h ?? 0), 0);
  const wsum = rows.reduce((a, r) => a + (r.rail == null && r.h == null ? (r.w ?? 1) : 0), 0) || 1;
  const free = Math.max(0.05, lh - fixed);
  let y = 0;
  return rows.map((r) => {
    const h = r.rail ?? r.h ?? ((r.w ?? 1) / wsum) * free;
    const out = { y0: y, y1: y + h, cy: y + h / 2, h, r };
    y += h;
    return out;
  });
}

/** Vertical bar pull with two stand-offs on a face at z (facing s). */
function pullBar(k, mat, x, y, z, s, L, { r = 0.012, off = 0.06 } = {}) {
  k.rod('hardware', mat, [x, y - L / 2, z + s * off], [x, y + L / 2, z + s * off], r, { segs: k.seg(14, 6) });
  for (const e of [-1, 1]) k.rod('hardware', mat, [x, y + e * (L / 2 - 0.06), z], [x, y + e * (L / 2 - 0.06), z + s * off], r * 0.7, { segs: k.seg(10, 5) });
}

/** Ring pull (door knocker style) on a round plate, face at z facing s. */
function ringPull(k, mat, x, y, z, s, R = 0.045) {
  k.cyl('hardware', mat, 0.03, 0.03, 0.006, x, y, z, { rx: s * PI / 2, segs: k.seg(16, 6) });
  const cy = y - R + 0.01;
  const pts = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * PI * 2; return [x + R * Math.cos(a), cy + R * Math.sin(a), z + s * 0.012]; });
  k.tube('hardware', mat, pts, 0.005, { closed: true, radial: k.seg(8, 4), segs: k.seg(24, 10) });
}

/** A flat leaf with a rectangular lite [x0, x1] × [y0, y1] (leaf-local), glass + steel beads. */
function leafLite(k, mat, { lw, lh, lt, X, zc }, [x0, x1, y0, y1], glass = 'glass-clear', bead = null) {
  k.box('leaf', mat, lw, y0, lt, X(lw / 2), y0 / 2, zc, { r: 0.003, segs: 2 });
  k.box('leaf', mat, lw, lh - y1, lt, X(lw / 2), (y1 + lh) / 2, zc, { r: 0.003, segs: 2 });
  if (x0 > 0.001) k.box('leaf', mat, x0, y1 - y0, lt, X(x0 / 2), (y0 + y1) / 2, zc, { r: 0.002 });
  k.box('leaf', mat, lw - x1, y1 - y0, lt, X((x1 + lw) / 2), (y0 + y1) / 2, zc, { r: 0.002 });
  k.box('glass', glass, x1 - x0 + 0.01, y1 - y0 + 0.01, 0.01, X((x0 + x1) / 2), (y0 + y1) / 2, zc, { r: 0 });
  if (bead) for (const s of [-1, 1]) ring(k, 'trim', bead, x1 - x0 + 0.03, y1 - y0 + 0.03, 0.02, 0.006, X((x0 + x1) / 2), (y0 + y1) / 2, zc + s * (lt / 2 + 0.003));
}

/** Plain jambs + head filling the reveal (no casings). */
function plainJambs(k, W, H, t, mat, fj = 0.04, role = 'frame') {
  for (const s of [-1, 1]) k.box(role, mat, fj, H, t, s * (W / 2 - fj / 2), H / 2, 0, { r: 0.002 });
  k.box(role, mat, W - 2 * fj, fj, t, 0, H - fj / 2, 0, { r: 0.002 });
}

/** Barn-door style top track on stand-offs (room face) with two rollers per leaf at the given leaf centres. */
function barnRail(k, t, { tl, tx, ty, mat, leaves, lw, zl, lt }) {
  k.box('track', mat, tl, 0.04, 0.008, tx, ty, t / 2 + 0.03, { r: 0.002 });
  const n = Math.max(3, Math.round(tl / 0.7));
  for (let i = 0; i < n; i++) k.cyl('track', mat, 0.012, 0.012, 0.03, tx - tl / 2 + 0.05 + (i * (tl - 0.1)) / (n - 1), ty, t / 2, { rx: PI / 2, segs: k.seg(12, 6) });
  for (const e of [-1, 1]) k.box('track', mat, 0.012, 0.05, 0.03, tx + e * (tl / 2 - 0.006), ty + 0.02, t / 2 + 0.042, { r: 0.002 });
  for (const x of leaves) for (const e of [-1, 1]) {
    const rx = x + e * (lw / 2 - 0.15);
    k.box('track', mat, 0.04, 0.24, 0.006, rx, ty - 0.03, zl + lt / 2 + 0.004, { r: 0.002 });
    k.cyl('track', mat, 0.04, 0.04, 0.02, rx, ty + 0.02, t / 2 + 0.045, { rx: PI / 2, segs: k.seg(20, 8) });
  }
}

const slideOpen = (max = 0.9) => P.num('open', '열림 정도', 'Open ratio', 0, 0, max, 0.05);
const slideSide = (def = 'left', ko = '열리는 쪽', en = 'Slides to') => P.pick('side', ko, en, def, OPT.hinge);
const glassP = (def = 'glass-clear') => P.mat('glassMat', '유리', 'Glass', def, 'glass');
const mat = (key, ko, en, def, filter) => P.mat(key, ko, en, def, filter);

/* ------------------------------------------------------ period hinged doors */

const studded = hingedDoor({
  id: 'door-studded-plank', ko: '징 박힌 판재 문(중세풍)', en: 'Studded plank door with strap hinges', w: 0.95,
  leafMat: 'wood-dark', frameMat: 'wood-dark', handleMat: 'metal-black', lt: 0.055, handles: false,
  tags: ['door', 'plank door', 'medieval door', 'studded door', 'strap hinge', 'castle door', '문', '판재 문', '중세풍 문', '징 박힌 문', '철물 장식 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    const n = Math.max(4, Math.round(lw / 0.15)), bw = lw / n;
    for (let i = 0; i < n; i++) k.box('leaf', m, bw - 0.004, lh, lt, X(bw * (i + 0.5)), lh / 2, zc, { r: 0.004, segs: 2 });
    for (const s of [-1, 1]) {
      const z = zc + s * lt / 2;
      for (const y of [0.3, lh - 0.3]) {
        k.box('hardware', p.handleMat, lw * 0.78, 0.05, 0.008, X(lw * 0.39), y, z + s * 0.004, { r: 0.002 });
        k.cyl('hardware', p.handleMat, 0.035, 0.035, 0.008, X(lw * 0.78), y, z, { rx: s * PI / 2, segs: k.seg(16, 6) });
      }
      for (let c = 1; c <= 3; c++) for (let r = 1; r <= 5; r++) k.sphere('hardware', p.handleMat, 0.01, X((lw * c) / 4), (lh * r) / 6 + 0.04, z, { segs: k.seg(8, 4), rings: k.seg(6, 3) });
      ringPull(k, p.handleMat, X(lw - 0.12), 1.05, z, s, 0.05);
    }
    return { noHandle: true };
  },
});

const DECO = { stile: 0.12, rows: [{ rail: 0.2 }, { type: 'flat', w: 1.15 }, { rail: 0.12 }, { type: 'glass', w: 1, glass: 'glass-frosted' }, { rail: 0.16 }] };
const deco = hingedDoor({
  id: 'door-deco-sunburst', ko: '아르데코 선버스트 문', en: 'Art Deco sunburst door',
  leafMat: 'wood-walnut', frameMat: 'wood-walnut', handleMat: 'metal-brass', handle: 'knob',
  tags: ['door', 'art deco door', 'sunburst door', 'vintage door', '문', '아르데코 문', '선버스트', '빈티지 문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat: m, dir } = o;
    specLeaf(k, DECO, o);
    const st = Math.min(0.12, lw * 0.36), fw = lw - 2 * st;
    const rows = rowYs(DECO.rows, lh), g = rows[3], low = rows[1];
    const gh = g.y1 - g.y0;
    // radiating glazing bars from a half sun at the bottom centre of the lite
    for (let i = 1; i <= 6; i++) {
      const a = (i * PI) / 7;
      const L = Math.min((fw / 2) / Math.max(1e-3, Math.abs(Math.cos(a))), gh / Math.sin(a)) - 0.006;
      k.box('leaf', m, L, 0.016, lt * 0.6, X(lw / 2 + (Math.cos(a) * L) / 2), g.y0 + (Math.sin(a) * L) / 2, zc, { r: 0.002, rz: dir > 0 ? a : PI - a });
    }
    const sun = new THREE.Shape();
    const rs = Math.min(0.12, fw * 0.25);
    sun.absarc(0, 0, rs, 0, PI, false);
    sun.lineTo(rs, 0);
    k.panel('leaf', m, sun, lt * 0.7, X(lw / 2), g.y0, zc, { bevel: 0.002 });
    // stepped brass inlays on the lower field
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) k.box('inlay', 'metal-brass', fw * (0.8 - j * 0.22), 0.012, 0.003, X(lw / 2), low.cy + (j - 1) * 0.14, zc + s * (lt * 0.21 + 0.0015), { r: 0 });
  },
});

const CRAFT = { stile: 0.12, rows: [{ rail: 0.24 }, { type: 'flat', w: 2.2, cols: 2, colMw: 0.1 }, { rail: 0.1 }, { type: 'glass', w: 0.75, cols: 3, colMw: 0.04 }, { rail: 0.14 }] };
const craftsman = hingedDoor({
  id: 'door-craftsman', ko: '크래프츠맨 3구 유리 문(덴틸 선반)', en: 'Craftsman door with dentil shelf',
  leafMat: 'wood-teak', frameMat: 'wood-teak', handleMat: 'metal-copper', lt: 0.045,
  tags: ['door', 'craftsman door', 'arts and crafts', 'dentil shelf', '문', '크래프츠맨 문', '덴틸', '유리 3구 문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat: m } = o;
    specLeaf(k, CRAFT, o);
    const y = rowYs(CRAFT.rows, lh)[2].y1;
    k.box('leaf', m, lw - 0.02, 0.03, lt + 0.06, X(lw / 2), y + 0.015, zc, { r: 0.004 });
    const n = Math.floor((lw - 0.1) / 0.05);
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) k.box('leaf', m, 0.025, 0.035, 0.02, X(0.05 + i * 0.05 + 0.0125), y - 0.0175, zc + s * (lt / 2 + 0.01), { r: 0.001 });
    return { handleY: 0.95 };
  },
});

const VICT = { stile: 0.12, rows: [{ rail: 0.22 }, { type: 'raised', w: 1.0, cols: 2 }, { rail: 0.16 }, { type: 'raised', w: 0.45, cols: 2 }, { rail: 0.12 }, { type: 'glass', w: 0.9, cols: 2, colMw: 0.09 }, { rail: 0.13 }] };
const STAIN = { red: '#9b2226', blue: '#1d4e89', amber: '#d9a404' };
const victorian = hingedDoor({
  id: 'door-victorian-stained', ko: '빅토리아풍 스테인드글라스 문', en: 'Victorian door with stained glass',
  leafMat: 'paint-green-matte', frameMat: 'paint-white-gloss', handleMat: 'metal-brass', handle: 'knob',
  tags: ['door', 'victorian door', 'stained glass door', 'period door', '문', '빅토리아풍 문', '스테인드글라스', '클래식 현관문'],
  leaf: (k, o) => {
    const { lw, lh, X, zc } = o;
    specLeaf(k, VICT, o);
    const st = Math.min(0.12, lw * 0.36), fw = lw - 2 * st, mw = 0.09, cw = (fw - mw) / 2;
    const g = rowYs(VICT.rows, lh)[5];
    for (let c = 0; c < 2; c++) {
      const cx = st + cw * (c + 0.5) + mw * c, fh = g.h;
      const col = (name) => ({ r: 0, overrides: { color: STAIN[name] } });
      const q = 0.05;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.box('glass', 'glass-clear', q, q, 0.01, X(cx + sx * (cw / 2 - q / 2)), g.cy + sy * (fh / 2 - q / 2), zc, col('red'));
      for (const sx of [-1, 1]) k.box('glass', 'glass-clear', 0.025, fh - 2 * q, 0.01, X(cx + sx * (cw / 2 - 0.0125)), g.cy, zc, col('blue'));
      for (const sy of [-1, 1]) k.box('glass', 'glass-clear', cw - 2 * q, 0.025, 0.01, X(cx), g.cy + sy * (fh / 2 - 0.0125), zc, col('blue'));
      const d = Math.min(cw, fh) * 0.4;
      k.box('glass', 'glass-clear', d, d, 0.01, X(cx), g.cy, zc, { ...col('amber'), rz: PI / 4 });
    }
  },
});

const cane = hingedDoor({
  id: 'door-cane-panel', ko: '라탄 케인 판넬 문', en: 'Rattan cane panel door',
  leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-brass', handle: 'knob', lt: 0.04,
  tags: ['door', 'cane door', 'rattan door', 'wicker door', '문', '라탄 문', '케인 도어', '등나무 문'],
  extra: [mat('cane', '케인', 'Cane', 'rattan')],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    const st = 0.1, ym = lh * 0.45;
    for (const s of [0, 1]) k.box('leaf', m, st, lh, lt, X(s ? lw - st / 2 : st / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    for (const [y, h] of [[0.1, 0.2], [ym, 0.12], [lh - 0.06, 0.12]]) k.box('leaf', m, lw - 2 * st, h, lt, X(lw / 2), y, zc, { r: 0.002 });
    const fw = lw - 2 * st;
    for (const [y0, y1] of [[0.2, ym - 0.06], [ym + 0.06, lh - 0.12]]) {
      const fh = y1 - y0, cy = (y0 + y1) / 2;
      k.box('cane', p.cane, fw + 0.01, fh + 0.01, 0.006, X(lw / 2), cy, zc, { r: 0 });
      ring(k, 'leaf', m, fw, fh, 0.014, lt * 0.7, X(lw / 2), cy, zc);
    }
  },
});

const mirrorDoor = hingedDoor({
  id: 'door-mirror-full', ko: '전신 거울 여닫이문(드레스룸)', en: 'Full-length mirror door',
  leafMat: 'paint-white-matte', frameMat: 'paint-white-matte', handleMat: 'metal-chrome', handle: 'knob', lt: 0.04,
  tags: ['door', 'mirror door', 'dressing room door', 'closet door', '문', '거울 문', '드레스룸 문', '전신 거울'],
  leaf: (k, o) => specLeaf(k, { stile: 0.07, rows: [{ rail: 0.08 }, { type: 'mirror' }, { rail: 0.08 }] }, o),
});

const CHALK = { stile: 0.11, rows: [{ rail: 0.2 }, { type: 'flat', w: 1 }, { rail: 0.12 }, { type: 'solid', w: 1.7 }, { rail: 0.12 }] };
const chalk = hingedDoor({
  id: 'door-chalkboard', ko: '칠판 문(주방·아이방)', en: 'Chalkboard door',
  leafMat: 'wood-white', frameMat: 'wood-white', handleMat: 'metal-black', handle: 'knob',
  tags: ['door', 'chalkboard door', 'blackboard', 'pantry door', 'kids door', '문', '칠판 문', '팬트리 문', '아이방 문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc } = o;
    specLeaf(k, CHALK, o);
    const st = Math.min(0.11, lw * 0.36), fw = lw - 2 * st, f = rowYs(CHALK.rows, lh)[3];
    const z = zc + lt / 2;
    k.box('board', 'paint-black-matte', fw - 0.02, f.h - 0.02, 0.004, X(lw / 2), f.cy, z + 0.002, { r: 0 });
    k.box('leaf', o.mat, fw - 0.02, 0.02, 0.04, X(lw / 2), f.y0 + 0.02, z + 0.02, { r: 0.003 });
    for (const dx of [-0.1, 0.05]) k.cyl('chalk', 'plastic-white', 0.005, 0.005, 0.08, X(lw / 2 + dx), f.y0 + 0.035, z + 0.02, { rz: PI / 2, segs: k.seg(8, 4) });
    return { handleY: 1.0 };
  },
});

const slimAlu = hingedDoor({
  id: 'door-slim-aluminium', ko: '슬림 알루미늄 프레임 유리문', en: 'Slim aluminium-framed glass door', frame: 'plain',
  leafMat: 'metal-black', frameMat: 'metal-black', handleMat: 'metal-black', handle: 'pull', lt: 0.04,
  tags: ['door', 'aluminium door', 'slim frame door', 'glass door', 'modern door', '문', '알루미늄 문', '슬림 프레임', '유리문', '모던 문'],
  extra: [glassP('glass-frosted')],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    ring(k, 'leaf', m, lw, lh, 0.024, lt, X(lw / 2), lh / 2, zc);
    k.box('glass', p.glassMat, lw - 0.04, lh - 0.04, 0.008, X(lw / 2), lh / 2, zc, { r: 0 });
    for (const f of [0.34, 0.67]) k.box('leaf', m, lw - 0.046, 0.01, lt * 0.5, X(lw / 2), lh * f, zc, { r: 0.001 });
  },
});

const invisible = hingedDoor({
  id: 'door-invisible', ko: '히든 도어(무문선 벽 일체형)', en: 'Invisible flush-to-wall door', frame: 'plain',
  leafMat: 'wall-paint-white', frameMat: 'wall-paint-white', handleMat: 'metal-aluminium', handle: 'none', lt: 0.045,
  tags: ['door', 'hidden door', 'invisible door', 'flush door', 'jambless door', '문', '히든 도어', '무문선 문', '벽 일체형 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m }) => {
    k.box('leaf', m, lw - 0.004, lh - 0.004, lt - 0.002, X(lw / 2), lh / 2, zc, { r: 0.001 });
    ring(k, 'hardware', 'metal-aluminium', lw, lh, 0.006, lt, X(lw / 2), lh / 2, zc, { bevel: 0.001 });
    // push-to-open latch slot on both faces
    for (const s of [-1, 1]) k.box('hardware', 'plastic-black', 0.012, 0.1, 0.002, X(lw - 0.03), 1.0, zc + s * (lt / 2 + 0.0005), { r: 0 });
    return { noHinges: true };
  },
});

const cubicle = hingedDoor({
  id: 'door-cubicle', ko: '화장실 칸막이 문(큐비클)', en: 'Toilet cubicle door', w: 0.65, wr: [0.55, 0.9], h: 2.0, hr: [1.8, 2.2], frame: 'plain',
  leafMat: 'plastic-grey', frameMat: 'metal-aluminium', handleMat: 'metal-chrome', lt: 0.025, handles: false,
  tags: ['door', 'toilet cubicle', 'restroom partition door', 'washroom', '문', '화장실 칸막이', '큐비클 문', '공중화장실'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    const y0 = 0.14;
    k.box('leaf', m, lw, lh - y0, lt, X(lw / 2), y0 + (lh - y0) / 2, zc, { r: 0.006, segs: 2 });
    // indicator bolt: thumb turn inside (+z), vacant/engaged window outside (−z)
    k.rbox('hardware', p.handleMat, 0.05, 0.1, 0.012, 0.004, X(lw - 0.05), 1.0, zc + lt / 2 + 0.006, { segs: k.seg(2, 1) });
    k.rbox('hardware', p.handleMat, 0.012, 0.045, 0.02, 0.004, X(lw - 0.05), 1.0, zc + lt / 2 + 0.018, { segs: k.seg(2, 1) });
    k.rbox('hardware', p.handleMat, 0.05, 0.1, 0.012, 0.004, X(lw - 0.05), 1.0, zc - lt / 2 - 0.006, { segs: k.seg(2, 1) });
    k.box('indicator', 'plastic-white', 0.03, 0.014, 0.003, X(lw - 0.05), 1.02, zc - lt / 2 - 0.013, { r: 0, overrides: { color: '#c0392b' } });
    // coat hook on the inside
    k.cyl('hardware', p.handleMat, 0.012, 0.012, 0.01, X(lw / 2), lh - 0.3, zc + lt / 2, { rx: PI / 2, segs: k.seg(12, 6) });
    k.rod('hardware', p.handleMat, [X(lw / 2), lh - 0.3, zc + lt / 2], [X(lw / 2), lh - 0.26, zc + lt / 2 + 0.05], 0.006);
    return { noHandle: true };
  },
});

const hospital = hingedDoor({
  id: 'door-hospital', ko: '병원 광폭문(범퍼 레일)', en: 'Wide hospital door with bumper rails', w: 1.2, wr: [1.0, 1.6], h: 2.1,
  leafMat: 'wood-ash', frameMat: 'paint-white-matte', handleMat: 'metal-steel', lt: 0.05,
  tags: ['door', 'hospital door', 'wide door', 'clinic door', 'kick plate', '문', '병원 문', '광폭문', '의료시설 문', '킥플레이트'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc } = o;
    leafLite(k, o.mat, o, [lw - 0.42, lw - 0.24, 1.2, Math.min(1.9, lh - 0.12)], 'glass-clear', 'metal-steel');
    for (const s of [-1, 1]) {
      const z = zc + s * lt / 2;
      k.box('trim', 'metal-steel', lw - 0.02, 0.3, 0.002, X(lw / 2), 0.16, z + s * 0.001, { r: 0 });
      k.rbox('guard', 'plastic-grey', lw - 0.06, 0.12, 0.02, 0.008, X(lw / 2), 0.6, z + s * 0.01, { segs: k.seg(2, 1) });
    }
  },
});

const exitDouble = hingedDoor({
  id: 'door-exit-double', ko: '비상구 양개 방화문(패닉바)', en: 'Fire exit double doors with push bars', pair: true, w: 1.8, wr: [1.4, 2.4], frame: 'plain', side: -1,
  leafMat: 'paint-grey-matte', frameMat: 'paint-grey-matte', handleMat: 'metal-steel', handle: 'none', lt: 0.055,
  tags: ['door', 'fire exit', 'emergency exit', 'panic bar', 'double door', 'steel door', '문', '비상구', '방화문', '패닉바', '양개 철문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    k.box('leaf', m, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    const zr = zc + lt / 2;
    k.rbox('hardware', p.handleMat, lw * 0.72, 0.06, 0.05, 0.012, X(lw * 0.56), 1.0, zr + 0.06, { segs: k.seg(3, 1) });
    for (const e of [lw * 0.2, lw - 0.05]) k.rbox('hardware', p.handleMat, 0.06, 0.1, 0.06, 0.01, X(e), 1.0, zr + 0.03, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) k.box('trim', 'metal-steel', lw - 0.04, 0.25, 0.002, X(lw / 2), 0.15, zc + s * (lt / 2 + 0.001), { r: 0 });
    k.box('sign', 'plastic-white', 0.22, 0.11, 0.003, X(lw / 2), 1.6, zr + 0.0015, { r: 0, overrides: { color: '#1f9d55' } });
    return { noHandle: true };
  },
});

const coldRoom = hingedDoor({
  id: 'door-cold-room', ko: '냉동·냉장 창고 문(스트립 커튼)', en: 'Cold room door with strip curtain', w: 1.0, wr: [0.8, 1.4], frame: 'plain', side: -1,
  leafMat: 'metal-steel', frameMat: 'metal-steel', handleMat: 'metal-chrome', lt: 0.08, handles: false,
  tags: ['door', 'cold room door', 'freezer door', 'walk-in cooler', 'strip curtain', '문', '냉동 창고 문', '냉장실 문', '스트립 커튼'],
  frameExtra: (k, p, { t, W, H }) => {
    const iw = W - 2 * JAMB, z = t / 2 + 0.02;
    k.box('frame', p.frameMat, iw, 0.04, 0.03, 0, H - JAMB - 0.02, z, { r: 0.002 });
    const n = Math.ceil(iw / 0.17), sw = 0.2, sh = H - JAMB - 0.05 - 0.012;
    for (let i = 0; i < n; i++) k.box('curtain', 'glass-frosted', sw, sh, 0.003, -iw / 2 + (iw / n) * (i + 0.5), 0.012 + sh / 2, z + (i % 2 ? 0.003 : -0.003), { r: 0 });
  },
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    k.box('leaf', m, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.01, segs: 2 });
    ring(k, 'gasket', 'rubber-black', lw - 0.01, lh - 0.01, 0.02, 0.008, X(lw / 2), lh / 2, zc + lt / 2 + 0.003);
    const zo = zc - lt / 2;
    k.rbox('hardware', p.handleMat, 0.09, 0.24, 0.05, 0.012, X(lw - 0.1), 1.05, zo - 0.025, { segs: k.seg(2, 1) });
    k.rbox('hardware', p.handleMat, 0.045, 0.32, 0.035, 0.012, X(lw - 0.1), 1.0, zo - 0.07, { segs: k.seg(2, 1) });
    k.cyl('hardware', 'plastic-white', 0.03, 0.03, 0.04, X(lw - 0.1), 1.05, zc + lt / 2, { rx: PI / 2, segs: k.seg(16, 6), overrides: { color: '#c0392b' } });
    for (const hy of [0.3, lh - 0.3]) k.rbox('hardware', p.handleMat, 0.16, 0.12, 0.03, 0.01, X(0.06), hy, zo - 0.015, { segs: k.seg(2, 1) });
    return { noHinges: true };
  },
});

const DIAM = { stile: 0.12, rows: [{ rail: 0.2 }, { type: 'raised', w: 1 }, { rail: 0.15 }, { type: 'raised', w: 1 }, { rail: 0.14 }] };
const diamond = hingedDoor({
  id: 'door-diamond-panel', ko: '마름모 장식 판넬 문', en: 'Diamond-panel door',
  leafMat: 'paint-blue-matte', frameMat: 'paint-white-gloss', handleMat: 'metal-brass',
  tags: ['door', 'diamond panel door', 'lozenge door', 'decorative door', '문', '마름모 문', '장식 판넬 문', '판넬 도어'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat: m } = o;
    specLeaf(k, DIAM, o);
    const fw = lw - 2 * Math.min(0.12, lw * 0.36);
    for (const f of [rowYs(DIAM.rows, lh)[1], rowYs(DIAM.rows, lh)[3]]) {
      const d = Math.min(fw, f.h) * 0.5;
      k.rbox('leaf', m, d, d, lt + 0.02, 0.008, X(lw / 2), f.cy, zc, { rz: PI / 4, segs: k.seg(2, 1) });
    }
  },
});

const plankH = hingedDoor({
  id: 'door-plank-horizontal', ko: '가로 루바 판재 모던 문', en: 'Horizontal-plank modern door',
  leafMat: 'wood-walnut', frameMat: 'paint-black-matte', handleMat: 'metal-black', handle: 'pull', lt: 0.045,
  tags: ['door', 'horizontal plank door', 'slatted door', 'modern door', '문', '가로 루바 문', '판재 문', '모던 원목 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m }) => {
    k.box('leaf', m, lw, lh, lt - 0.012, X(lw / 2), lh / 2, zc, { r: 0.002 });
    const n = Math.max(8, Math.round(lh / 0.11)), bh = lh / n;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.box('leaf', m, lw, bh - 0.006, 0.006, X(lw / 2), bh * (i + 0.5), zc + s * (lt / 2 - 0.003), { r: 0.001 });
  },
});

const leather = hingedDoor({
  id: 'door-leather-tufted', ko: '가죽 버튼 장식 문(서재)', en: 'Leather-upholstered tufted door', lt: 0.05,
  leafMat: 'wood-dark', frameMat: 'wood-dark', handleMat: 'metal-brass',
  tags: ['door', 'leather door', 'padded door', 'tufted door', 'study door', '문', '가죽 문', '패딩 도어', '서재 문', '체스터필드'],
  extra: [mat('leather', '가죽', 'Leather', 'leather-brown', 'leather')],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    k.box('leaf', m, lw, lh, lt - 0.03, X(lw / 2), lh / 2, zc, { r: 0.003 });
    for (const s of [-1, 1]) {
      const z = zc + s * lt / 2;
      k.soft('leather', p.leather, lw - 0.02, lh - 0.02, 0.03, 0.012, X(lw / 2), lh / 2, zc + s * (lt / 2 - 0.015), { flat: 3 });
      for (let r = 0; r < 7; r++) for (let c = 0; c < (r % 2 ? 2 : 3); c++) {
        const x = r % 2 ? lw * (0.375 + c * 0.25) : lw * (0.25 + c * 0.25);
        k.sphere('hardware', p.leather, 0.012, X(x), 0.25 + (r * (lh - 0.5)) / 6, z + s * 0.012, { segs: k.seg(8, 4), rings: k.seg(6, 3) });
      }
      const step = 0.08, ins = 0.025;
      const nx = Math.floor((lw - 2 * ins) / step), ny = Math.floor((lh - 2 * ins) / step);
      for (let i = 0; i <= nx; i++) for (const y of [ins, lh - ins]) k.sphere('nails', p.handleMat, 0.006, X(ins + ((lw - 2 * ins) * i) / nx), y, z + s * 0.012, { segs: k.seg(6, 4), rings: k.seg(4, 3) });
      for (let j = 1; j < ny; j++) for (const x of [ins, lw - ins]) k.sphere('nails', p.handleMat, 0.006, X(x), ins + ((lh - 2 * ins) * j) / ny, z + s * 0.012, { segs: k.seg(6, 4), rings: k.seg(4, 3) });
    }
  },
});

const riveted = hingedDoor({
  id: 'door-riveted-steel', ko: '리벳 철판 문(인더스트리얼)', en: 'Riveted steel-plate door',
  leafMat: 'paint-grey-matte', frameMat: 'metal-black', handleMat: 'metal-black', lt: 0.05, frame: 'plain',
  tags: ['door', 'riveted door', 'steel door', 'industrial door', 'loft door', '문', '리벳 문', '철판 문', '인더스트리얼 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m }) => {
    k.box('leaf', m, lw, lh, lt - 0.008, X(lw / 2), lh / 2, zc, { r: 0.003 });
    const split = lh * 0.48;
    for (const s of [-1, 1]) {
      const z = zc + s * (lt / 2 - 0.002);
      for (const [y0, y1] of [[0.02, split - 0.03], [split + 0.03, lh - 0.02]]) {
        k.box('leaf', m, lw - 0.04, y1 - y0, 0.004, X(lw / 2), (y0 + y1) / 2, z, { r: 0.001 });
        const nx = Math.max(3, Math.round((lw - 0.08) / 0.11)), ny = Math.max(3, Math.round((y1 - y0 - 0.04) / 0.11));
        for (let i = 0; i <= nx; i++) for (const y of [y0 + 0.02, y1 - 0.02]) k.sphere('rivets', 'metal-steel', 0.007, X(0.04 + ((lw - 0.08) * i) / nx), y, z + s * 0.002, { segs: k.seg(8, 4), rings: k.seg(5, 3) });
        for (let j = 1; j < ny; j++) for (const x of [0.04, lw - 0.04]) k.sphere('rivets', 'metal-steel', 0.007, X(x), y0 + 0.02 + ((y1 - y0 - 0.04) * j) / ny, z + s * 0.002, { segs: k.seg(8, 4), rings: k.seg(5, 3) });
      }
      k.box('leaf', m, lw, 0.06, 0.012, X(lw / 2), split, z + s * 0.004, { r: 0.002 });
    }
  },
});

const sauna = hingedDoor({
  id: 'door-sauna', ko: '사우나 유리문(원목 손잡이)', en: 'Sauna glass door', w: 0.7, wr: [0.6, 0.9], h: 1.9, hr: [1.8, 2.1], side: -1,
  leafMat: 'glass-tinted', frameMat: 'wood-ash', handleMat: 'metal-chrome', lt: 0.01, handles: false,
  tags: ['door', 'sauna door', 'glass door', 'spa door', 'steam room', '문', '사우나 문', '찜질방 문', '유리문', '편백'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    k.box('leaf', m, lw, lh, 0.008, X(lw / 2), lh / 2, zc, { r: 0.002, overrides: { color: '#9a7b56' } });
    for (const hy of [0.25, lh - 0.25]) k.rbox('hardware', p.handleMat, 0.09, 0.06, 0.03, 0.006, X(0.045), hy, zc, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) {
      const z = zc + s * (lt / 2 + 0.035);
      k.rbox('handle', p.frameMat, 0.035, 0.36, 0.035, 0.012, X(lw - 0.07), 1.0, z, { segs: k.seg(3, 1) });
      for (const e of [-1, 1]) k.rod('handle', p.handleMat, [X(lw - 0.07), 1.0 + e * 0.12, zc], [X(lw - 0.07), 1.0 + e * 0.12, z], 0.006);
    }
    return { noHandle: true, noHinges: true };
  },
});

const screenDoor = hingedDoor({
  id: 'door-screen-storm', ko: '방충 스크린 도어(덧문)', en: 'Storm / screen door', side: -1,
  leafMat: 'metal-aluminium', frameMat: 'paint-white-gloss', handleMat: 'metal-black', lt: 0.03,
  tags: ['door', 'screen door', 'storm door', 'insect screen', '문', '방충문', '스크린 도어', '덧문', '방충망'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m }) => {
    const b = 0.06;
    ring(k, 'leaf', m, lw, lh, b, lt, X(lw / 2), lh / 2, zc);
    k.box('leaf', m, lw - 2 * b, 0.1, lt, X(lw / 2), 0.8, zc, { r: 0.002 });
    k.box('leaf', m, lw - 2 * b, 0.45 - b, lt * 0.4, X(lw / 2), b + (0.45 - b) / 2, zc, { r: 0.001 });
    for (const [y0, y1] of [[0.45, 0.75], [0.85, lh - b]]) k.box('screen', 'glass-tinted', lw - 2 * b + 0.01, y1 - y0, 0.002, X(lw / 2), (y0 + y1) / 2, zc, { r: 0 });
    k.rod('hardware', 'metal-aluminium', [X(0.1), lh - 0.12, zc + lt / 2 + 0.022], [X(0.45), lh - 0.12, zc + lt / 2 + 0.022], 0.012, { segs: k.seg(12, 6) });
    return { handleY: 1.0 };
  },
});

const grille = hingedDoor({
  id: 'door-security-grille', ko: '방범 방충문(철제 창살)', en: 'Security grille door', side: -1, frame: 'plain',
  leafMat: 'metal-black', frameMat: 'metal-black', handleMat: 'metal-steel', lt: 0.035,
  tags: ['door', 'security door', 'grille door', 'iron gate door', '문', '방범문', '방충문', '창살 문', '철문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m }) => {
    const b = 0.045;
    ring(k, 'leaf', m, lw, lh, b, lt, X(lw / 2), lh / 2, zc);
    const n = Math.max(4, Math.round((lw - 2 * b) / 0.1));
    for (let i = 1; i < n; i++) k.box('leaf', m, 0.016, lh - 2 * b, 0.016, X(b + ((lw - 2 * b) * i) / n), lh / 2, zc, { r: 0.002 });
    for (const y of [0.45, lh * 0.5 + 0.2, lh - 0.45]) k.box('leaf', m, lw - 2 * b, 0.04, 0.008, X(lw / 2), y, zc + 0.012, { r: 0.002 });
    k.box('screen', 'glass-tinted', lw - 2 * b + 0.01, lh - 2 * b + 0.01, 0.002, X(lw / 2), lh / 2, zc + lt * 0.3, { r: 0 });
    k.rbox('leaf', m, 0.09, 0.22, lt + 0.012, 0.006, X(lw - 0.075), 1.0, zc, { segs: k.seg(2, 1) });
  },
});

/* ---------------------------------------------------------- entrance doors */

const entranceStrip = hingedDoor({
  id: 'door-entrance-glassstrip', ko: '원목 현관문(세로 유리띠·롱 핸들)', en: 'Wooden entrance door with glass strip', w: 1.0, wr: [0.85, 1.3], hr: [1.9, 2.5],
  side: -1, frame: 'plain', threshold: true, leafMat: 'wood-walnut', frameMat: 'paint-black-matte', handleMat: 'metal-black', lt: 0.06, handles: false,
  tags: ['door', 'entrance door', 'front door', 'wooden door', 'long pull handle', '문', '현관문', '원목 현관문', '롱 핸들', '디지털 도어락'],
  extra: [glassP('glass-frosted')],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, p } = o;
    leafLite(k, o.mat, o, [0.14, 0.26, 0.25, lh - 0.25], p.glassMat, 'metal-black');
    for (const s of [-1, 1]) pullBar(k, p.handleMat, X(lw - 0.1), 1.05, zc + s * lt / 2, s, 1.2, { r: 0.014, off: 0.07 });
    k.rbox('lock', 'plastic-black', 0.07, 0.26, 0.03, 0.008, X(lw - 0.24), 1.15, zc - lt / 2 - 0.015, { segs: k.seg(2, 1) });
    k.rbox('lock', 'plastic-black', 0.08, 0.32, 0.045, 0.01, X(lw - 0.24), 1.12, zc + lt / 2 + 0.022, { segs: k.seg(2, 1) });
    return { noHandle: true };
  },
});

const smartDoor = hingedDoor({
  id: 'door-entrance-smart', ko: '단열 스마트 현관문(지문 인식)', en: 'Insulated smart entrance door (fingerprint)', w: 1.0, wr: [0.85, 1.3], hr: [1.9, 2.5],
  side: -1, frame: 'plain', threshold: true, leafMat: 'paint-black-matte', frameMat: 'paint-grey-matte', handleMat: 'metal-aluminium', lt: 0.065, handles: false,
  tags: ['door', 'smart door', 'entrance door', 'fingerprint lock', 'insulated door', '문', '스마트 현관문', '지문 인식', '단열 현관문', '도어락'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    k.box('leaf', m, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.004, segs: 2 });
    const zo = zc - lt / 2, zi = zc + lt / 2;
    for (const y of [0.35, 0.65, 1.7, 1.95]) if (y < lh - 0.1) k.box('inlay', p.handleMat, lw - 0.14, 0.008, 0.003, X(lw / 2 - 0.04), y, zo - 0.0015, { r: 0 });
    for (const s of [-1, 1]) k.rbox('hardware', p.handleMat, 0.03, lh - 0.5, 0.03, 0.01, X(lw - 0.045), lh / 2, zc + s * (lt / 2 + 0.015), { segs: k.seg(2, 1) });
    k.rbox('lock', 'plastic-black', 0.07, 0.3, 0.03, 0.01, X(lw - 0.17), 1.2, zo - 0.015, { segs: k.seg(2, 1) });
    k.box('lock-pad', 'screen-black', 0.05, 0.11, 0.004, X(lw - 0.17), 1.27, zo - 0.031, { r: 0.002 });
    k.cyl('lock-pad', 'metal-chrome', 0.012, 0.012, 0.004, X(lw - 0.17), 1.11, zo - 0.03, { rx: -PI / 2, segs: k.seg(16, 6) });
    k.rbox('lock', 'plastic-black', 0.085, 0.36, 0.05, 0.012, X(lw - 0.17), 1.15, zi + 0.025, { segs: k.seg(2, 1) });
    k.cyl('lock-pad', 'plastic-black', 0.015, 0.015, 0.012, X(lw / 2), 1.55, zo, { rx: -PI / 2, segs: k.seg(14, 6) });
    k.rbox('hardware', p.handleMat, 0.28, 0.06, 0.06, 0.01, X(lw - 0.25), lh - 0.08, zi + 0.03, { segs: k.seg(2, 1) });
    return { noHandle: true, noHinges: true };
  },
});

const transom = item({
  id: 'door-entrance-transom', category: 'doors', placement: 'opening', ko: '상부 채광창 현관문(트랜섬)', en: 'Front door with transom light',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.0, 2.5, [0.8, 1.3], [2.2, 3.0]), P.len('transom', '채광창 높이', 'Transom height', 0.4, 0.25, 0.7), hingeParam(), openParam(),
    mat('leafMat', '문짝', 'Leaf', 'paint-blue-matte'), mat('frameMat', '문틀', 'Frame', 'paint-white-gloss'), mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-brass', 'metal')],
  tags: ['door', 'front door', 'transom', 'entrance door', 'fanlight', '문', '현관문', '채광창', '트랜섬', '상부 고정창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.05, iw = W - 2 * JAMB;
    doorFrame(k, W, H, t, p.frameMat, { threshold: true });
    const tr = clamp(p.transom, 0.2, H - 1.85), ys = H - JAMB - tr;
    k.box('frame', p.frameMat, iw, 0.06, t, 0, ys - 0.03, 0, { r: 0.002 });
    const gh = H - JAMB - ys, gy = ys + gh / 2;
    k.box('glass', 'glass-clear', iw, gh, 0.01, 0, gy, 0, { r: 0 });
    ring(k, 'frame', p.frameMat, iw, gh, 0.025, 0.04, 0, gy, 0);
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.025, gh - 0.04, 0.03, (s * iw) / 6, gy, 0, { r: 0.002 });
    const zFace = t / 2 - 0.004, zs = zFace - lt - 0.0175, sh = ys - 0.06;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.012, sh, 0.035, s * (iw / 2 - 0.006), sh / 2, zs, { r: 0.002 });
    k.box('frame', p.frameMat, iw, 0.012, 0.035, 0, sh - 0.006, zs, { r: 0.002 });
    const lw = iw - 2 * GAP, lh = sh - GAP - 0.008 - 0.012, dir = p.hinge === 'right' ? -1 : 1;
    swingAt(k, { hx: dir * -(iw / 2 - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.02 }, (zc) => {
      const X = (x) => dir * x;
      specLeaf(k, { stile: 0.12, rows: [{ rail: 0.22 }, { type: 'raised', w: 1.2, cols: 2 }, { rail: 0.16 }, { type: 'raised', w: 1, cols: 2 }, { rail: 0.14 }] }, { lw, lh, lt, X, zc, mat: p.leafMat });
      barrels(k, X, lh, zc + lt / 2 - 0.004, p.handleMat);
      for (const s of [-1, 1]) addLever(k, X(lw - 0.065), 1.0, zc + s * lt / 2, s, -dir, 'lever', p.handleMat, true);
      ringPull(k, p.handleMat, X(lw / 2), Math.min(1.55, lh - 0.25), zc - lt / 2, -1, 0.05);
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const doubleSide = item({
  id: 'door-double-sidelights', category: 'doors', placement: 'opening', ko: '양쪽 사이드라이트 양개 현관문', en: 'Double front doors with sidelights',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(2.6, 2.2, [2.0, 3.4], [1.9, 2.7]), openParam(),
    mat('leafMat', '문짝', 'Leaves', 'wood-oak'), mat('frameMat', '문틀', 'Frame', 'paint-white-gloss'), glassP('glass-frosted'), mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal')],
  tags: ['door', 'double front door', 'sidelights', 'entrance', 'grand entrance', '문', '양개 현관문', '사이드라이트', '대형 현관문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.05, mw = 0.06;
    doorFrame(k, W, H, t, p.frameMat, { threshold: true });
    const sl = clamp((W - 2 * JAMB - 2 * mw - 1.7) / 2, 0.2, 0.5), dw = W - 2 * JAMB - 2 * sl - 2 * mw;
    const zFace = t / 2 - 0.004, zs = zFace - lt - 0.0175;
    for (const s of [-1, 1]) {
      k.box('frame', p.frameMat, mw, H - JAMB, t, s * (dw / 2 + mw / 2), (H - JAMB) / 2, 0, { r: 0.003 });
      k.box('frame', p.frameMat, 0.012, H - JAMB, 0.035, s * (dw / 2 - 0.006), (H - JAMB) / 2, zs, { r: 0.002 });
      const xs = s * (dw / 2 + mw + sl / 2);
      asRole(k, 'fixed', () => withMatrix(k, M4(0, 0.012, 0), () => specLeaf(k, { stile: 0.06, rows: [{ rail: 0.1 }, { type: 'raised', h: 0.42 }, { rail: 0.08 }, { type: 'glass', glass: p.glassMat, grid: [1, 3] }, { rail: 0.08 }] },
        { lw: sl, lh: H - JAMB - 0.012, lt, X: (x) => xs - sl / 2 + x, zc: 0, mat: p.leafMat, glass: p.glassMat })));
    }
    k.box('frame', p.frameMat, dw, 0.012, 0.035, 0, H - JAMB - 0.006, zs, { r: 0.002 });
    const lw = (dw - 3 * GAP) / 2, lh = H - JAMB - GAP - 0.02;
    for (const dir of [1, -1]) {
      swingAt(k, { hx: dir * -(dw / 2 - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.012 }, (zc) => {
        const X = (x) => dir * x;
        specLeaf(k, { stile: 0.12, rows: [{ rail: 0.22 }, { type: 'raised', w: 1.1 }, { rail: 0.16 }, { type: 'glass', w: 1, glass: p.glassMat, grid: [1, 3] }, { rail: 0.14 }] }, { lw, lh: lh - 0.004, lt, X, zc, mat: p.leafMat, glass: p.glassMat });
        barrels(k, X, lh, zc + lt / 2 - 0.004, p.handleMat);
        for (const s of [-1, 1]) pullBar(k, p.handleMat, X(lw - 0.08), 1.05, zc + s * lt / 2, s, 0.6);
      });
    }
    k.userData.swing = { hinge: 'both', radius: lw };
    return k.group();
  },
});

const gate = hingedDoor({
  id: 'door-gate-steel', ko: '철제 양개 대문', en: 'Steel double gate', pair: true, w: 2.4, wr: [1.6, 3.6], h: 2.0, hr: [1.5, 2.6], frame: 'plain',
  leafMat: 'metal-black', frameMat: 'metal-black', handleMat: 'metal-black', lt: 0.04, handles: false,
  tags: ['door', 'gate', 'iron gate', 'steel gate', 'courtyard gate', 'double gate', '문', '대문', '철 대문', '양개 대문', '마당 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p }) => {
    const b = 0.05;
    ring(k, 'leaf', m, lw, lh, b, lt, X(lw / 2), lh / 2, zc);
    k.box('leaf', m, lw - 2 * b, 0.45, lt * 0.4, X(lw / 2), b + 0.225, zc, { r: 0.001 });
    k.box('leaf', m, lw - 2 * b, 0.04, lt, X(lw / 2), b + 0.47, zc, { r: 0.002 });
    const yTop = lh - b - 0.2;
    k.box('leaf', m, lw - 2 * b, 0.03, lt * 0.8, X(lw / 2), yTop, zc, { r: 0.002 });
    const n = Math.max(3, Math.round((lw - 2 * b) / 0.12)), bw = (lw - 2 * b) / n;
    for (let i = 1; i < n; i++) k.box('leaf', m, 0.018, yTop - (b + 0.49), 0.018, X(b + bw * i), (yTop + b + 0.49) / 2, zc, { r: 0.002 });
    const R = Math.min(bw, 0.17) * 0.4, cyc = (yTop + 0.015 + lh - b) / 2;
    for (let i = 0; i < n; i++) {
      const cx = X(b + bw * (i + 0.5));
      const pts = Array.from({ length: 12 }, (_, j) => { const a = (j / 12) * PI * 2; return [cx + R * Math.cos(a), cyc + R * Math.sin(a), zc]; });
      k.tube('leaf', m, pts, 0.007, { closed: true, radial: k.seg(6, 4), segs: k.seg(16, 8) });
    }
    k.rbox('hardware', p.handleMat, 0.05, 0.12, lt + 0.03, 0.008, X(lw - 0.06), 1.0, zc, { segs: k.seg(2, 1) });
    k.rod('hardware', p.handleMat, [X(lw * 0.3), 0.02, zc + lt / 2 + 0.015], [X(lw * 0.3), 0.6, zc + lt / 2 + 0.015], 0.008);
    return { noHandle: true };
  },
});

const CARR = { stile: 0.11, rows: [{ rail: 0.15 }, { type: 'flat', w: 2.0 }, { rail: 0.1 }, { type: 'glass', w: 0.65, cols: 2, colMw: 0.05 }, { rail: 0.11 }] };
const carriage = hingedDoor({
  id: 'door-carriage-garage', ko: '캐리지하우스 양개 차고문', en: 'Carriage-house garage doors', pair: true, w: 2.6, wr: [2.0, 3.4], h: 2.2, hr: [1.9, 2.6], side: -1,
  leafMat: 'wood-teak', frameMat: 'paint-white-gloss', handleMat: 'metal-black', lt: 0.05, handles: false,
  tags: ['door', 'garage door', 'carriage house door', 'swing garage door', '문', '차고 문', '캐리지 하우스', '양개 차고문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat: m, p, dir } = o;
    specLeaf(k, CARR, o);
    const st = Math.min(0.11, lw * 0.36), fw = lw - 2 * st, f = rowYs(CARR.rows, lh)[1];
    const a = Math.atan2(f.h, fw), L = Math.hypot(fw, f.h) - 0.06;
    for (const s of [-1, 1]) k.box('leaf', m, L, 0.1, 0.014, X(lw / 2), f.cy, zc + s * (lt * 0.21 + 0.007), { r: 0.003, rz: dir * a });
    const zo = zc - lt / 2;
    for (const y of [0.35, lh - 0.35]) {
      k.box('hardware', p.handleMat, lw * 0.5, 0.045, 0.006, X(lw * 0.25), y, zo - 0.003, { r: 0.002 });
      k.cyl('hardware', p.handleMat, 0.03, 0.03, 0.006, X(lw * 0.5), y, zo, { rx: -PI / 2, segs: k.seg(16, 6) });
    }
    for (const s of [-1, 1]) ringPull(k, p.handleMat, X(lw - 0.15), 1.1, zc + s * lt / 2, s, 0.05);
    return { noHandle: true };
  },
});

const vault = hingedDoor({
  id: 'door-vault', ko: '금고형 안전실 문(핸들 휠)', en: 'Vault door with wheel handle', w: 1.0, wr: [0.8, 1.3], hr: [1.9, 2.4], frame: 'plain',
  leafMat: 'metal-steel', frameMat: 'metal-steel', handleMat: 'metal-chrome', lt: 0.08, handles: false,
  tags: ['door', 'vault door', 'safe room door', 'bank vault', 'wine vault', '문', '금고 문', '안전실 문', '볼트 도어'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, p, dir }) => {
    k.box('leaf', m, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.012, segs: 2 });
    const zf = zc + lt / 2;
    ring(k, 'leaf', m, lw - 0.1, lh - 0.1, 0.03, 0.012, X(lw / 2), lh / 2, zf + 0.004);
    const cx = X(lw / 2), cy = 1.1, R = Math.min(0.2, lw * 0.22);
    k.cyl('hardware', p.handleMat, 0.05, 0.05, 0.06, cx, cy, zf, { rx: PI / 2, segs: k.seg(20, 8) });
    const rim = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * PI * 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a), zf + 0.06]; });
    k.tube('hardware', p.handleMat, rim, 0.014, { closed: true, radial: k.seg(10, 5), segs: k.seg(32, 12) });
    for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; k.rod('hardware', p.handleMat, [cx, cy, zf + 0.06], [cx + R * Math.cos(a), cy + R * Math.sin(a), zf + 0.06], 0.01); }
    k.cyl('hardware', p.handleMat, 0.06, 0.065, 0.03, cx, Math.min(cy + R + 0.2, lh - 0.15), zf, { rx: PI / 2, segs: k.seg(24, 8) });
    for (const y of [0.4, lh / 2, lh - 0.4]) k.cyl('hardware', p.handleMat, 0.022, 0.022, 0.025, X(lw), y, zc, { rz: dir > 0 ? -PI / 2 : PI / 2, segs: k.seg(14, 6) });
    for (const y of [0.35, lh - 0.35]) k.cyl('hardware', m, 0.03, 0.03, 0.26, X(-0.012), y - 0.13, zf - 0.015, { segs: k.seg(16, 6) });
    return { noHandle: true, noHinges: true };
  },
});

const CHN = { stile: 0.08, rows: [{ rail: 0.1 }, { type: 'flat', h: 0.5 }, { rail: 0.07 }, { type: 'flat', h: 0.2 }, { rail: 0.07 }, { type: 'lattice', grid: [3, 6], w: 1 }, { rail: 0.08 }] };
const chinese = hingedDoor({
  id: 'door-chinese-lattice', ko: '중국풍 격자 양개문', en: 'Chinese lattice double doors', pair: true, w: 1.6,
  leafMat: 'wood-dark', frameMat: 'wood-dark', handleMat: 'metal-brass', lt: 0.045, handles: false,
  tags: ['door', 'chinese door', 'lattice door', 'oriental door', 'double door', '문', '중국풍 문', '격자 양개문', '동양풍 문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat: m, p } = o;
    specLeaf(k, CHN, o);
    const rows = rowYs(CHN.rows, lh), L = rows[5], fw = lw - 2 * 0.08;
    const sq = Math.min(fw, L.h) * 0.42;
    k.panel('leaf', m, frameShape(sq, sq, 0.02), lt * 0.55, X(lw / 2), L.cy, zc, { rz: PI / 4, bevel: 0.002 });
    ring(k, 'leaf', m, sq * 0.55, sq * 0.55, 0.018, lt * 0.55, X(lw / 2), L.cy, zc);
    k.cyl('leaf', m, 0.09, 0.09, lt + 0.016, X(lw / 2), rows[1].cy, zc - lt / 2 - 0.008, { rx: PI / 2, segs: k.seg(24, 8) });
    for (const s of [-1, 1]) {
      k.cyl('hardware', p.handleMat, 0.065, 0.065, 0.004, X(lw - 0.09), 1.05, zc + s * lt / 2, { rx: s * PI / 2, segs: k.seg(20, 8) });
      ringPull(k, p.handleMat, X(lw - 0.09), 1.04, zc + s * (lt / 2 + 0.004), s, 0.05);
    }
    return { noHandle: true };
  },
});

const chevron = hingedDoor({
  id: 'door-chevron', ko: '헤링본 쉐브론 원목 문', en: 'Chevron-plank wooden door',
  leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-black', handle: 'pull', lt: 0.045,
  tags: ['door', 'chevron door', 'herringbone door', 'wood door', '문', '쉐브론 문', '헤링본 문', '원목 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m, dir }) => {
    const st = 0.1, y0 = 0.12, y1 = lh - 0.1;
    for (const s of [0, 1]) k.box('leaf', m, st, lh, lt, X(s ? lw - st / 2 : st / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    k.box('leaf', m, lw - 2 * st, y0, lt, X(lw / 2), y0 / 2, zc, { r: 0.002 });
    k.box('leaf', m, lw - 2 * st, lh - y1, lt, X(lw / 2), (y1 + lh) / 2, zc, { r: 0.002 });
    k.box('leaf', m, lw - 2 * st, y1 - y0, lt - 0.012, X(lw / 2), (y0 + y1) / 2, zc, { r: 0.001 });
    const fwh = (lw - 2 * st) / 2, cx = lw / 2, bw = 0.085, step = bw * Math.SQRT2;
    for (let yc = y0 + step / 2; yc < y1 + fwh; yc += step) {
      const s0 = Math.max(0, yc - y1), s1 = Math.min(fwh, yc - y0);
      if (s1 - s0 < 0.02) continue;
      const sm = (s0 + s1) / 2, L = (s1 - s0) * Math.SQRT2 - 0.004;
      for (const h of [-1, 1]) for (const f of [-1, 1]) {
        k.box('leaf', m, L, bw - 0.005, 0.006, X(cx + h * sm), yc - sm, zc + f * (lt / 2 - 0.003), { r: 0.001, rz: dir * (h > 0 ? -PI / 4 : PI / 4) });
      }
    }
  },
});

const wine = hingedDoor({
  id: 'door-wine-cellar', ko: '와인셀러 단조 유리 양개문', en: 'Wrought-iron wine cellar doors', pair: true, w: 1.4, wr: [1.0, 2.0],
  leafMat: 'metal-black', frameMat: 'wood-dark', handleMat: 'metal-black', lt: 0.04,
  tags: ['door', 'wine cellar door', 'wrought iron door', 'glass door', 'double door', '문', '와인셀러 문', '단조 문', '철제 유리문'],
  leaf: (k, { lw, lh, lt, X, zc, mat: m }) => {
    const b = 0.06, iw = lw - 2 * b;
    ring(k, 'leaf', m, lw, lh, b, lt, X(lw / 2), lh / 2, zc);
    k.box('glass', 'glass-clear', iw + 0.01, lh - 2 * b + 0.01, 0.01, X(lw / 2), lh / 2, zc, { r: 0 });
    const zg = zc - 0.013;
    for (const f of [0.25, 0.5, 0.75]) k.rod('leaf', m, [X(b + iw * f), b, zg], [X(b + iw * f), lh - b, zg], 0.006, { segs: k.seg(8, 4) });
    const r = (iw / 4) * 0.22;
    for (const gy of [lh * 0.3, lh * 0.55, lh * 0.8]) for (const g of [0.125, 0.375, 0.625, 0.875]) {
      const gx = b + iw * g, pts = [];
      for (let i = 0; i <= 8; i++) { const a = -PI / 2 + (i / 8) * PI; pts.push([X(gx + r * Math.cos(a)), gy + r + r * Math.sin(a), zg]); }
      for (let i = 1; i <= 8; i++) { const a = PI / 2 + (i / 8) * PI; pts.push([X(gx + r * Math.cos(a)), gy - r + r * Math.sin(a), zg]); }
      k.tube('leaf', m, pts, 0.005, { radial: k.seg(6, 4), segs: k.seg(20, 8) });
    }
  },
});

/* ----------------------------------------------------------- arched leaves */

const archedDouble = item({
  id: 'door-arched-double', category: 'doors', placement: 'opening', ko: '지중해풍 아치 양개문', en: 'Mediterranean arched double doors',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.6, 2.5, [1.2, 2.4], [2.1, 3.0]), P.len('rise', '아치 높이', 'Arch rise', 0.45, 0.15, 0.9), openParam(),
    mat('leafMat', '문짝', 'Leaves', 'wood-dark'), mat('frameMat', '문틀', 'Frame', 'wood-dark'), mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal')],
  tags: ['door', 'arched double door', 'mediterranean door', 'spanish door', 'arch door', '문', '아치 양개문', '지중해풍 문', '스페인풍 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.05, n = k.seg(32, 10);
    const wi = W - 2 * JAMB, rise = clamp(p.rise, 0.05, Math.min(wi / 2, H - 1.9));
    const c = archCircle(wi, H - rise, rise);
    for (const s of [-1, 1]) k.box('frame', p.frameMat, JAMB, H, t, s * (W / 2 - JAMB / 2), H / 2, 0, { r: 0.002 });
    k.panel('frame', p.frameMat, spandrelShape(wi, c, H, n), t, 0, 0, 0, { bevel: 0.002 });
    for (const side of [1, -1]) k.panel('casing', p.frameMat, archBand(wi, c, 0.1, 0, n), 0.016, 0, 0, side * (t / 2 + 0.008), { bevel: 0.004 });
    const zFace = t / 2 - 0.004, ys = H - rise, y0 = 0.008;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.012, ys - 0.01, 0.035, s * (W / 2 - JAMB - 0.006), (ys - 0.01) / 2, zFace - lt - 0.0175, { r: 0.002 });
    const lw = (wi - 3 * GAP) / 2;
    for (const dir of [1, -1]) {
      const hx = dir * -(wi / 2 - GAP);
      swingAt(k, { hx, dir, zFace, angle: p.open * DEG, lt, y0 }, (zc) => {
        const X = (x) => dir * x;
        const gc = -hx, cy = c.cy - y0, R = c.R - GAP;
        const yAt = (g) => cy + Math.sqrt(Math.max(0, R * R - (g - gc) ** 2));
        const shape = new THREE.Shape([V2(0, 0), V2(X(lw), 0), ...arcPts(gc, cy, R, X(lw), 0, n)]);
        const ly1 = yAt(0) - 0.16, ly0 = Math.max(1.05, ly1 - 0.6);
        const lx0 = 0.13, lx1 = lw - 0.11;
        shape.holes.push(new THREE.Path([V2(X(lx0), ly0), V2(X(lx1), ly0), V2(X(lx1), ly1), V2(X(lx0), ly1)]));
        k.panel('leaf', p.leafMat, shape, lt, 0, 0, zc, { bevel: 0.003 });
        const lcx = X((lx0 + lx1) / 2), lcy = (ly0 + ly1) / 2;
        k.box('glass', 'glass-clear', lx1 - lx0 + 0.01, ly1 - ly0 + 0.01, 0.008, lcx, lcy, zc, { r: 0 });
        k.rod('hardware', p.handleMat, [lcx, ly0, zc], [lcx, ly1, zc], 0.007, { segs: k.seg(8, 4) });
        k.rod('hardware', p.handleMat, [X(lx0), lcy, zc], [X(lx1), lcy, zc], 0.007, { segs: k.seg(8, 4) });
        const top = ly0 - 0.15, ph = (top - 0.2 - 0.1) / 2, pw = lw - 0.24;
        for (const r of [0, 1]) {
          const py = 0.2 + ph / 2 + r * (ph + 0.1);
          k.rbox('leaf', p.leafMat, pw, ph, lt + 0.012, 0.008, X(lw / 2), py, zc, { segs: k.seg(3, 1) });
          for (const fx of [-1, 1]) for (const fy of [-1, 1]) k.sphere('hardware', p.handleMat, 0.008, X(lw / 2 + fx * (pw / 2 - 0.04)), py + fy * (ph / 2 - 0.04), zc + lt / 2 + 0.006, { segs: k.seg(8, 4), rings: k.seg(6, 3) });
        }
        barrels(k, X, ys - 0.1, zc + lt / 2 - 0.004, p.handleMat, 2);
        for (const s of [-1, 1]) addLever(k, X(lw - 0.07), 1.0, zc + s * lt / 2, s, -dir, 'lever', p.handleMat, dir > 0);
      });
    }
    k.userData.swing = { hinge: 'both', radius: lw };
    return k.group();
  },
});

/** Pointed (gothic) arch of span w: two arcs of radius R through the springing points; y(x) above the springing line ys. */
function pointedArch(w, R) {
  const ccx = w / 2 - R; // centre of the right-hand arc (left of the middle)
  const rise = Math.sqrt(Math.max(1e-6, R * R - ccx * ccx));
  const yAt = (x, r = R) => Math.sqrt(Math.max(0, r * r - (Math.abs(x) - ccx) ** 2));
  /** Points along the arch of radius r from x = a to x = b (the apex is included when crossed). */
  const pts = (a, b, n, ys, r = R) => {
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push(a + ((b - a) * i) / n);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) { xs.push(0); xs.sort((p, q) => (a < b ? p - q : q - p)); }
    return xs.map((x) => V2(x, ys + yAt(x, r)));
  };
  return { ccx, rise, yAt, pts };
}

const gothic = item({
  id: 'door-gothic', category: 'doors', placement: 'opening', ko: '고딕 첨두아치 판재 문', en: 'Gothic pointed-arch plank door',
  bboxSlack: [0.1, 0.2, 0.06], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.0, 2.5, [0.8, 1.4], [2.2, 3.0]), hingeParam(), openParam(),
    mat('leafMat', '문짝', 'Leaf', 'wood-dark'), mat('frameMat', '석재 테두리', 'Stone surround', 'granite-grey'), mat('handleMat', '철물', 'Ironwork', 'metal-black', 'metal')],
  tags: ['door', 'gothic door', 'pointed arch door', 'church door', 'plank door', '문', '고딕 문', '첨두 아치 문', '성당 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.05, fj = 0.06, n = k.seg(24, 8);
    const wi = W - 2 * fj, R = wi * 0.65, A = pointedArch(wi, R);
    const ys = H - A.rise - 0.03;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fj, H, t, s * (W / 2 - fj / 2), H / 2, 0, { r: 0.003 });
    k.panel('frame', p.frameMat, new THREE.Shape([V2(wi / 2, ys), V2(wi / 2, H), V2(-wi / 2, H), V2(-wi / 2, ys), ...A.pts(-wi / 2, wi / 2, n, ys).slice(1, -1)]), t, 0, 0, 0, { bevel: 0.002 });
    const b = 0.12, Ro = R + b;
    const outerTop = ys + A.yAt(0, Ro);
    void outerTop;
    const band = new THREE.Shape([V2(-wi / 2 - b, 0), V2(-wi / 2, 0), V2(-wi / 2, ys), ...A.pts(-wi / 2, wi / 2, n, ys).slice(1, -1), V2(wi / 2, ys), V2(wi / 2, 0), V2(wi / 2 + b, 0), V2(wi / 2 + b, ys), ...A.pts(wi / 2 + b, -wi / 2 - b, n, ys, Ro).slice(1, -1), V2(-wi / 2 - b, ys)]);
    for (const side of [1, -1]) k.panel('casing', p.frameMat, band, 0.03, 0, 0, side * (t / 2 + 0.015), { bevel: 0.006 });
    const zFace = t / 2 - 0.004;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.012, ys - 0.01, 0.035, s * (wi / 2 - 0.006), (ys - 0.01) / 2, zFace - lt - 0.0175, { r: 0.002 });
    const lw = wi - 2 * GAP, y0 = 0.008, dir = p.hinge === 'right' ? -1 : 1, hx = dir * -(wi / 2 - GAP), Ri = R - GAP;
    swingAt(k, { hx, dir, zFace, angle: p.open * DEG, lt, y0 }, (zc) => {
      const X = (x) => dir * x;
      const topAt = (g) => ys - y0 + A.yAt(g + hx, Ri);
      const arc = A.pts(hx + X(lw), hx, n, ys - y0, Ri).map((v) => V2(v.x - hx, v.y));
      k.panel('leaf', p.leafMat, new THREE.Shape([V2(0, 0), V2(X(lw), 0), ...arc]), lt, 0, 0, zc, { bevel: 0.003 });
      const np = Math.max(4, Math.round(lw / 0.14));
      for (let i = 1; i < np; i++) {
        const g = X((lw * i) / np), hh = topAt(g) - 0.06;
        for (const s of [-1, 1]) k.box('leaf', p.leafMat, 0.006, hh - 0.04, 0.003, g, 0.04 + (hh - 0.04) / 2, zc + s * (lt / 2 + 0.001), { r: 0 });
      }
      for (const s of [-1, 1]) {
        const z = zc + s * lt / 2;
        for (const y of [0.35, ys - 0.35]) {
          k.box('hardware', p.handleMat, lw * 0.7, 0.045, 0.008, X(lw * 0.35), y, z + s * 0.004, { r: 0.002 });
          for (const e of [-1, 1]) k.box('hardware', p.handleMat, 0.1, 0.03, 0.008, X(lw * 0.68), y + e * 0.03, z + s * 0.004, { r: 0.002, rz: e * dir * 0.6 });
        }
        ringPull(k, p.handleMat, X(lw - 0.13), 1.05, z, s, 0.055);
      }
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

/* ------------------------------------------------------------ Korean 중문 */

const jmSwing = item({
  id: 'door-jungmun-swing', category: 'doors', placement: 'opening', ko: '여닫이 중문(양쪽 픽스 유리)', en: 'Swing entry partition door (jungmun) with fixed glass',
  bboxSlack: [0.02, 0.02, 0.06], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.5, 2.3, [1.2, 2.0], [2.0, 2.7]), hingeParam(), openParam(),
    mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal'), glassP('glass-tinted'), mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal')],
  tags: ['door', 'jungmun', 'entry partition', 'swing door', 'glass door', '문', '중문', '여닫이 중문', '스윙 중문', '현관 중문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fj = 0.04, lt = 0.04, mw = 0.03;
    plainJambs(k, W, H, t, p.frameMat, fj);
    const iw = W - 2 * fj, dw = clamp(iw - 0.5, 0.7, 1.0), fs = (iw - dw) / 2 - mw;
    const zFace = t / 2 - 0.004, zp = zFace - lt / 2, ph = H - fj - 0.01;
    for (const s of [-1, 1]) {
      k.box('frame', p.frameMat, mw, ph, t, s * (dw / 2 + mw / 2), ph / 2, 0, { r: 0.002 });
      k.box('frame', p.frameMat, 0.012, ph, 0.03, s * (dw / 2 - 0.006), ph / 2, zFace - lt - 0.015, { r: 0.002 });
      if (fs > 0.05) {
        const xs = s * (dw / 2 + mw + fs / 2);
        ring(k, 'fixed', p.frameMat, fs, ph, 0.03, lt, xs, ph / 2, zp);
        k.box('glass', p.glassMat, fs - 0.04, ph - 0.04, 0.008, xs, ph / 2, zp, { r: 0 });
        for (const f of [0.35, 0.7]) k.box('fixed', p.frameMat, fs - 0.05, 0.01, lt * 0.5, xs, ph * f, zp, { r: 0.001 });
      }
    }
    const lw = dw - 2 * GAP, lh = ph - GAP - 0.01, dir = p.hinge === 'right' ? -1 : 1;
    swingAt(k, { hx: dir * -(dw / 2 - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.01 }, (zc) => {
      const X = (x) => dir * x;
      ring(k, 'leaf', p.frameMat, lw, lh, 0.03, lt, X(lw / 2), lh / 2, zc);
      k.box('glass', p.glassMat, lw - 0.04, lh - 0.04, 0.008, X(lw / 2), lh / 2, zc, { r: 0 });
      for (const f of [0.35, 0.7]) k.box('leaf', p.frameMat, lw - 0.05, 0.01, lt * 0.5, X(lw / 2), lh * f, zc, { r: 0.001 });
      for (const s of [-1, 1]) pullBar(k, p.handleMat, X(lw - 0.07), 1.05, zc + s * lt / 2, s, 1.0);
      barrels(k, X, lh, zc + lt / 2 - 0.004, p.handleMat);
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const jm3 = item({
  id: 'door-jungmun-3slide', category: 'doors', placement: 'opening', ko: '3연동 슬라이딩 중문', en: 'Three-panel telescopic sliding partition (jungmun)',
  bboxSlack: [0.02, 0.02, 0.04],
  params: [...doorCommon(1.5, 2.3, [1.2, 2.4], [2.0, 2.7]), slideOpen(1), slideSide('left', '모이는 쪽', 'Stacks to'),
    mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal'), glassP('glass-clear')],
  tags: ['door', 'jungmun', '3 panel sliding door', 'telescopic sliding door', 'sliding door', '문', '중문', '3연동 중문', '슬라이딩 중문', '연동 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fj = 0.04;
    plainJambs(k, W, H, t, p.frameMat, fj);
    const iw = W - 2 * fj, ov = 0.04, pw = (iw + 2 * ov) / 3, ph = H - fj - 0.06 - 0.012, s = p.side === 'left' ? -1 : 1;
    k.box('frame', p.frameMat, iw, 0.06, 0.12, 0, H - fj - 0.03, 0, { r: 0.002 });
    k.box('frame', 'metal-aluminium', iw, 0.006, 0.1, 0, 0.003, 0, { r: 0 });
    const shut = 1 - clamp(p.open, 0, 1);
    for (let i = 0; i < 3; i++) {
      const x = s * (iw / 2 - pw / 2) - s * i * (pw - ov) * shut, z = -0.035 + 0.035 * i, y = 0.012 + ph / 2;
      ring(k, 'panels', p.frameMat, pw, ph, 0.035, 0.028, x, y, z);
      k.box('glass', p.glassMat, pw - 0.06, ph - 0.06, 0.006, x, y, z, { r: 0 });
      for (const f of [0.4, 0.75]) k.box('panels', p.frameMat, pw - 0.07, 0.01, 0.014, x, 0.012 + ph * f, z, { r: 0.001 });
      if (i === 2) for (const f of [-1, 1]) k.rbox('hardware', p.frameMat, 0.02, 0.6, 0.012, 0.005, x - s * (pw / 2 - 0.05), 1.05, z + f * 0.02, { segs: k.seg(2, 1) });
    }
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const jmAuto = item({
  id: 'door-jungmun-auto', category: 'doors', placement: 'opening', ko: '자동 슬라이딩 중문(센서)', en: 'Automatic sliding partition door (jungmun)',
  bboxSlack: [0.02, 0.02, 0.06], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.4, 2.3, [1.1, 2.2], [2.1, 2.7]), slideOpen(), slideSide('right'), mat('frameMat', '프레임', 'Frame', 'metal-aluminium', 'metal'), glassP('glass-clear')],
  tags: ['door', 'jungmun', 'automatic door', 'auto sliding door', 'sensor door', 'sliding door', '문', '자동 중문', '자동문', '센서 도어', '슬라이딩 중문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fj = 0.03, hb = 0.16;
    plainJambs(k, W, H, t, p.frameMat, fj);
    k.box('header', p.frameMat, W - 2 * fj, hb, t * 0.7, 0, H - fj - hb / 2, 0, { r: 0.004, segs: 2 });
    k.rbox('sensor', 'plastic-black', 0.14, 0.035, 0.03, 0.008, 0, H - fj - hb / 2, t * 0.35 + 0.015, { segs: k.seg(2, 1) });
    const iw = W - 2 * fj, pw = iw / 2 + 0.03, ph = H - fj - hb - 0.02, s = p.side === 'left' ? -1 : 1, y = 0.01 + ph / 2;
    const xf = s * (iw / 2 - pw / 2), xm = -s * (iw / 2 - pw / 2) + s * clamp(p.open, 0, 0.9) * (pw - 0.06);
    k.box('glass', p.glassMat, pw, ph, 0.01, xf, y, -0.025, { r: 0.002 });
    for (const yy of [0.04, ph - 0.02]) k.box('frame', p.frameMat, pw, 0.05, 0.03, xf, yy, -0.025, { r: 0.003 });
    k.box('glass', p.glassMat, pw, ph - 0.05, 0.01, xm, y - 0.025, 0.025, { r: 0.002 });
    k.box('panels', p.frameMat, pw, 0.05, 0.03, xm, ph - 0.02, 0.025, { r: 0.003 });
    k.box('panels', 'plastic-black', 0.06, 0.02, 0.03, xm, 0.02, 0.025, { r: 0.003 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const autoSliding = item({
  id: 'door-auto-sliding', category: 'doors', placement: 'opening', ko: '양방향 자동문(상가 출입구)', en: 'Automatic bi-parting sliding doors',
  bboxSlack: [0.02, 0.02, 0.06],
  params: [...doorCommon(2.8, 2.4, [2.0, 4.0], [2.1, 3.0]), slideOpen(1), mat('frameMat', '프레임', 'Frame', 'metal-aluminium', 'metal'), glassP('glass-clear')],
  tags: ['door', 'automatic door', 'shop entrance', 'bi-parting door', 'sliding door', 'commercial door', '문', '자동문', '상가 자동문', '양방향 자동문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fj = 0.06, hb = 0.25;
    plainJambs(k, W, H, t, p.frameMat, fj);
    k.box('header', p.frameMat, W - 2 * fj, hb, t, 0, H - fj - hb / 2, 0, { r: 0.004, segs: 2 });
    for (const f of [-1, 1]) k.rbox('sensor', 'plastic-black', 0.2, 0.04, 0.03, 0.008, 0, H - fj - hb + 0.05, f * (t / 2 + 0.015), { segs: k.seg(2, 1) });
    k.box('frame', 'metal-steel', W - 2 * fj, 0.01, t, 0, 0.005, 0, { r: 0.002 });
    const iw = W - 2 * fj, q = iw / 4 + 0.03, ph = H - fj - hb - 0.015, y = 0.01 + ph / 2, o = clamp(p.open, 0, 1) * (q - 0.05);
    for (const s of [-1, 1]) {
      const xs = s * (iw / 2 - q / 2);
      ring(k, 'fixed', p.frameMat, q, ph, 0.05, 0.04, xs, y, -0.03);
      k.box('glass', p.glassMat, q - 0.08, ph - 0.08, 0.008, xs, y, -0.03, { r: 0 });
      const xm = s * (q / 2) + s * o;
      ring(k, 'panels', p.frameMat, q, ph, 0.05, 0.04, xm, y, 0.03);
      k.box('glass', p.glassMat, q - 0.08, ph - 0.08, 0.008, xm, y, 0.03, { r: 0 });
    }
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

/* ------------------------------------------------------------ shower doors */

const showerParams = (w, wr) => [...doorCommon(w, 2.0, wr, [1.8, 2.2])];
const showerMats = (glass = 'glass-clear') => [glassP(glass), mat('handleMat', '하드웨어', 'Hardware', 'metal-chrome', 'metal'), mat('curb', '샤워 턱', 'Curb', 'marble-white', 'stone')];
/** Tiled reveal + stone curb shared by the shower doors. */
function showerSurround(k, W, H, t, p) {
  linings(k, W, H, t, 0, 'tile-subway-white');
  k.box('curb', p.curb, W - 0.024, 0.04, t, 0, 0.02, 0, { r: 0.003 });
}

const showerHinged = item({
  id: 'door-shower-hinged', category: 'doors', placement: 'opening', ko: '샤워부스 여닫이 강화유리 문', en: 'Frameless hinged shower door',
  bboxSlack: [0.02, 0.02, 0.06], anchor: { asymmetricZ: true },
  params: [...showerParams(0.8, [0.6, 1.0]), hingeParam(), openParam(), ...showerMats()],
  tags: ['door', 'shower door', 'glass shower door', 'frameless shower', 'bathroom', '문', '샤워부스 문', '샤워 도어', '강화유리', '욕실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.01;
    showerSurround(k, W, H, t, p);
    const zFace = t / 2 - 0.025, lw = W - 0.024 - 2 * GAP - 0.004, lh = H - 0.04 - 0.012 - 0.01, dir = p.hinge === 'right' ? -1 : 1;
    const hx = dir * -(W / 2 - 0.012 - GAP);
    for (const hy of [0.3, lh - 0.3]) k.rbox('frame', p.handleMat, 0.03, 0.07, 0.05, 0.006, hx - dir * 0.01, 0.046 + hy, zFace - 0.005, { segs: k.seg(2, 1) });
    swingAt(k, { hx, dir, zFace, angle: p.open * DEG, lt, y0: 0.046 }, (zc) => {
      const X = (x) => dir * x;
      k.box('leaf', p.glassMat, lw, lh, 0.008, X(lw / 2), lh / 2, zc, { r: 0.002 });
      for (const hy of [0.3, lh - 0.3]) k.rbox('hardware', p.handleMat, 0.07, 0.07, 0.03, 0.006, X(0.04), hy, zc, { segs: k.seg(2, 1) });
      for (const s of [-1, 1]) pullBar(k, p.handleMat, X(lw - 0.06), 1.05, zc + s * 0.004, s, 0.3, { r: 0.009, off: 0.05 });
      k.box('seal', 'glass-clear', lw, 0.02, 0.014, X(lw / 2), 0.01, zc, { r: 0 });
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const showerSliding = item({
  id: 'door-shower-sliding', category: 'doors', placement: 'opening', ko: '샤워부스 슬라이딩 유리문(롤러 바)', en: 'Sliding shower door on a roller bar',
  bboxSlack: [0.02, 0.02, 0.06],
  params: [...showerParams(1.4, [1.0, 1.8]), slideOpen(), slideSide('left'), ...showerMats()],
  tags: ['door', 'shower door', 'sliding shower door', 'bathroom', 'sliding door', '문', '샤워부스 문', '슬라이딩 샤워 도어', '욕실 미닫이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height;
    showerSurround(k, W, H, t, p);
    const iw = W - 0.024, pw = iw / 2 + 0.04, ph = H - 0.04 - 0.16 - 0.006, yb = 0.046, s = p.side === 'left' ? -1 : 1;
    const xf = s * (iw / 2 - pw / 2);
    k.box('fixed', p.glassMat, pw, ph, 0.008, xf, yb + ph / 2, -0.015, { r: 0.002 });
    k.box('frame', p.handleMat, 0.015, ph, 0.025, s * (iw / 2 - 0.0075), yb + ph / 2, -0.015, { r: 0.002 });
    const xm = -s * (iw / 2 - pw / 2) + s * clamp(p.open, 0, 0.9) * (pw - 0.08);
    k.box('panels', p.glassMat, pw, ph, 0.008, xm, yb + ph / 2, 0.015, { r: 0.002 });
    k.rod('rail', p.handleMat, [-iw / 2, H - 0.07, 0.04], [iw / 2, H - 0.07, 0.04], 0.012, { segs: k.seg(12, 6) });
    for (const e of [-1, 1]) {
      const xw = xm + e * (pw / 2 - 0.1);
      k.rbox('hardware', p.handleMat, 0.04, 0.14, 0.006, 0.002, xw, H - 0.1, 0.022, { segs: k.seg(2, 1) });
      k.cyl('hardware', p.handleMat, 0.025, 0.025, 0.02, xw, H - 0.033, 0.03, { rx: PI / 2, segs: k.seg(16, 6) });
    }
    for (const f of [-1, 1]) pullBar(k, p.handleMat, xm - s * (pw / 2 - 0.05), 1.05, 0.015 + f * 0.004, f, 0.45, { r: 0.009, off: 0.045 });
    k.box('frame', 'plastic-grey', 0.03, 0.02, 0.06, xf - s * (pw / 2 - 0.02), 0.05, 0, { r: 0.003 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const showerBifold = item({
  id: 'door-shower-bifold', category: 'doors', placement: 'opening', ko: '샤워부스 접이식 유리문', en: 'Bifold shower door',
  bboxSlack: [0.02, 0.02, 0.06], anchor: { asymmetricZ: true },
  params: [...showerParams(0.9, [0.7, 1.1]), P.num('open', '접힘 정도', 'Fold ratio', 0, 0, 1, 0.05), ...showerMats('glass-frosted')],
  tags: ['door', 'shower door', 'bifold shower door', 'folding door', 'bathroom', '문', '샤워부스 문', '접이식 샤워 도어', '폴딩 도어', '욕실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height;
    showerSurround(k, W, H, t, p);
    const iw = W - 0.024 - 0.04, pw = (iw - 0.006) / 2, ph = H - 0.04 - 0.03 - 0.012;
    for (const s of [-1, 1]) k.box('frame', p.handleMat, 0.02, H - 0.04, 0.035, s * (iw / 2 + 0.01), 0.04 + (H - 0.04) / 2, 0, { r: 0.002 });
    k.box('frame', p.handleMat, iw, 0.025, 0.035, 0, H - 0.0125, 0, { r: 0.002 });
    const a = clamp(p.open, 0, 1) * 80 * DEG;
    let hx = -iw / 2, hz = 0;
    for (let i = 0; i < 2; i++) {
      const ang = i % 2 === 0 ? -a : a;
      withMatrix(k, M4(hx, 0.046, hz).multiply(RY(ang)), () => {
        ring(k, 'panels', p.handleMat, pw - 0.003, ph, 0.025, 0.02, pw / 2, ph / 2, 0);
        k.box('glass', p.glassMat, pw - 0.04, ph - 0.04, 0.006, pw / 2, ph / 2, 0, { r: 0 });
        if (i === 0) for (const hy of [0.25, ph - 0.25]) k.cyl('hardware', p.handleMat, 0.008, 0.008, 0.08, pw, hy - 0.04, 0, { segs: k.seg(10, 5) });
        if (i === 1) for (const f of [-1, 1]) k.cyl('hardware', p.handleMat, 0.015, 0.015, 0.035, pw - 0.06, 1.0, f * 0.01, { rx: f * PI / 2, segs: k.seg(14, 6) });
      });
      hx += Math.cos(ang) * pw;
      hz -= Math.sin(ang) * pw;
    }
    k.userData.swing = { hinge: 'none', radius: 0, fold: 'left' };
    return k.group();
  },
});

const showerPivot = item({
  id: 'door-shower-pivot', category: 'doors', placement: 'opening', ko: '샤워부스 피벗 유리문', en: 'Pivot shower door',
  bboxSlack: [0.02, 0.02, 0.06], anchor: { asymmetricZ: true },
  params: [...showerParams(0.9, [0.7, 1.1]), openParam(), ...showerMats()],
  tags: ['door', 'shower door', 'pivot shower door', 'glass door', 'bathroom', '문', '샤워부스 문', '피벗 샤워 도어', '회전 유리문', '욕실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height;
    showerSurround(k, W, H, t, p);
    for (const s of [-1, 1]) k.box('frame', p.handleMat, 0.03, H - 0.04, 0.04, s * (W / 2 - 0.027), 0.04 + (H - 0.04) / 2, 0, { r: 0.002 });
    k.box('frame', p.handleMat, W - 0.084, 0.03, 0.04, 0, H - 0.015, 0, { r: 0.002 });
    const lw = W - 0.084 - 0.006, lh = H - 0.04 - 0.03 - 0.012, pv = 0.12, px = -lw / 2 + pv;
    const m = pivot(0, 0, 0, { ry: -p.open * DEG });
    m.premultiply(M4(px, 0.046, 0));
    withMatrix(k, m, () => {
      k.box('leaf', p.glassMat, lw, lh, 0.008, lw / 2 - pv, lh / 2, 0, { r: 0.002 });
      for (const y of [-0.006, lh]) k.cyl('hardware', p.handleMat, 0.012, 0.012, 0.012, 0, y - 0.003, 0, { segs: k.seg(12, 6) });
      for (const s of [-1, 1]) pullBar(k, p.handleMat, lw - pv - 0.07, 1.05, s * 0.004, s, 0.3, { r: 0.009, off: 0.05 });
    });
    k.userData.swing = { hinge: 'left', radius: lw - pv, pivot: pv };
    return k.group();
  },
});

/* ---------------------------------------------------------- sliding doors */

const slideGlassWall = item({
  id: 'door-slide-glass-wall', category: 'doors', placement: 'opening', ko: '벽부형 유리 슬라이딩 도어(소프트 클로징)', en: 'Wall-hung sliding glass door (soft-close track)',
  bboxSlack: [1.1, 0.25, 0.12], anchor: { asymmetricX: true, asymmetricZ: true },
  params: [...doorCommon(0.9, 2.1), slideOpen(1), slideSide('right'), mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal'), glassP('glass-clear'), mat('trackMat', '레일', 'Track', 'metal-aluminium', 'metal')],
  tags: ['door', 'sliding door', 'glass sliding door', 'wall hung door', 'soft close', '문', '유리 슬라이딩 도어', '벽부형 미닫이', '소프트 클로징'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.03;
    doorFrame(k, W, H, t, 'paint-white-matte', { casing: false });
    const s = p.side === 'left' ? -1 : 1, lw = W + 0.1, lh = H + 0.05, zl = t / 2 + 0.025 + lt / 2, ty = lh + 0.07;
    const tl = 2 * lw + 0.1, tx = (s * lw) / 2;
    k.box('track', p.trackMat, tl, 0.06, 0.05, tx, ty, t / 2 + 0.025, { r: 0.004, segs: 2 });
    for (const e of [-1, 1]) k.box('track', 'plastic-black', 0.012, 0.062, 0.052, tx + e * (tl / 2 - 0.006), ty, t / 2 + 0.025, { r: 0.002 });
    const x = s * clamp(p.open, 0, 1) * lw, y = 0.01 + lh / 2;
    ring(k, 'leaf', p.frameMat, lw, lh, 0.03, lt, x, y, zl);
    k.box('glass', p.glassMat, lw - 0.04, lh - 0.04, 0.008, x, y, zl, { r: 0 });
    for (const e of [-1, 1]) k.rbox('hardware', p.trackMat, 0.06, 0.06, 0.01, 0.003, x + e * (lw / 2 - 0.15), lh + 0.035, zl - 0.005, { segs: k.seg(2, 1) });
    for (const f of [-1, 1]) k.rbox('hardware', p.frameMat, 0.025, 0.4, 0.02, 0.006, x - s * (lw / 2 - 0.05), 1.0, zl + f * (lt / 2 + 0.01), { segs: k.seg(2, 1) });
    k.box('track', 'plastic-black', 0.03, 0.02, 0.05, s * (W / 2 + 0.06), 0.01, zl, { r: 0.003 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const liftSlide = item({
  id: 'door-lift-slide', category: 'doors', placement: 'opening', ko: '리프트 슬라이딩 도어(목재·알루미늄)', en: 'Lift-and-slide patio door (wood-aluminium)',
  bboxSlack: [0.04, 0.02, 0.06],
  params: [...doorCommon(3.0, 2.4, [2.0, 5.0], [2.0, 2.8]), slideOpen(), mat('frameMat', '외부 프레임', 'Exterior frame', 'metal-aluminium', 'metal'), mat('woodMat', '실내 목재', 'Interior wood', 'wood-oak', 'wood'), glassP('glass-clear')],
  tags: ['door', 'lift and slide door', 'patio door', 'sliding door', 'terrace door', '문', '리프트 슬라이딩', '테라스 문', '발코니 문', '시스템 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fd = Math.min(0.16, t - 0.02), fb = 0.08;
    ring(k, 'frame', p.frameMat, W, H, fb, fd, 0, H / 2, 0);
    ring(k, 'cladding', p.woodMat, W - 0.01, H - 0.01, fb - 0.01, 0.02, 0, H / 2, fd / 2 + 0.008);
    linings(k, W, H, t, fd + 0.016, 'paint-white-matte');
    const iw = W - 2 * fb, pw = iw / 2 + 0.05, ph = H - 2 * fb - 0.01, pd = fd / 2 - 0.012, y = fb + 0.005 + ph / 2;
    const xs = [-iw / 2 + pw / 2, iw / 2 - pw / 2 - clamp(p.open, 0, 0.9) * (pw - 0.1)];
    xs.forEach((x, i) => {
      const z = i ? fd / 4 : -fd / 4;
      ring(k, 'panels', p.frameMat, pw, ph, 0.11, pd, x, y, z);
      k.box('glass', p.glassMat, pw - 0.2, ph - 0.2, 0.03, x, y, z, { r: 0 });
      ring(k, 'cladding', p.woodMat, pw - 0.004, ph - 0.004, 0.1, 0.012, x, y, z + pd / 2 + 0.006);
    });
    const xh = xs[1] - pw / 2 + 0.055, zh = fd / 4 + pd / 2 + 0.012;
    k.rbox('hardware', 'metal-steel', 0.06, 0.22, 0.02, 0.008, xh, fb + 1.05, zh + 0.01, { segs: k.seg(2, 1) });
    k.rbox('hardware', 'metal-steel', 0.035, 0.32, 0.025, 0.01, xh, fb + 0.95, zh + 0.035, { segs: k.seg(2, 1) });
    k.rbox('hardware', 'metal-steel', 0.03, 0.14, 0.012, 0.005, xh, fb + 1.05, fd / 4 - pd / 2 - 0.006, { segs: k.seg(2, 1) });
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'left' };
    return k.group();
  },
});

const oxxo = item({
  id: 'door-patio-oxxo', category: 'doors', placement: 'opening', ko: '4짝 중앙 개방 슬라이딩 도어(OXXO)', en: 'Four-panel centre-opening patio door (OXXO)',
  bboxSlack: [0.04, 0.02, 0.04],
  params: [...doorCommon(4.0, 2.3, [3.0, 6.0], [2.0, 2.8]), slideOpen(), mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal')],
  tags: ['door', 'patio door', 'sliding door', '4 panel sliding door', 'centre opening', '문', '4짝 슬라이딩 도어', '중앙 개방', '테라스 문', '거실 창호'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fb = 0.05, fd = Math.min(0.12, t - 0.02);
    ring(k, 'frame', p.frameMat, W, H, fb, fd, 0, H / 2, 0);
    for (const s of [-1, 1]) k.box('frame', 'metal-aluminium', W - 2 * fb, 0.012, 0.006, 0, fb + 0.006, (s * fd) / 4, { r: 0.001 });
    linings(k, W, H, t, fd, 'paint-white-matte');
    const iw = W - 2 * fb, pw = iw / 4 + 0.03, ph = H - 2 * fb - 0.004, pd = fd / 2 - 0.008, o = clamp(p.open, 0, 0.9) * (pw - 0.08);
    for (const s of [-1, 1]) {
      slidePanel(k, s * (iw / 2 - pw / 2), pw, ph, -fd / 4, pd, p.frameMat);
      slidePanel(k, s * (pw / 2) + s * o, pw, ph, fd / 4, pd, p.frameMat, { pull: -s });
    }
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return shiftRole(k.group(), ['panels', 'glass', 'gasket', 'hardware'], fb + 0.002);
  },
});

const pocketTele = item({
  id: 'door-pocket-telescopic', category: 'doors', placement: 'opening', ko: '2연동 포켓 도어(텔레스코픽)', en: 'Telescopic two-panel pocket door',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricX: true },
  params: [...doorCommon(1.4, 2.1, [1.0, 2.0], [1.8, 2.6]), slideOpen(), slideSide('left', '들어가는 쪽', 'Slides into'), mat('leafMat', '문짝', 'Panels', 'paint-white-matte'), mat('frameMat', '문틀', 'Frame', 'wood-white')],
  tags: ['door', 'pocket door', 'telescopic door', 'sliding door', '문', '포켓 도어', '2연동 도어', '벽 속 미닫이', '연동 미닫이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.035;
    doorFrame(k, W, H, t, p.frameMat);
    const iw = W - 2 * JAMB, pw = iw / 2 + 0.02, lh = H - JAMB - 0.012, s = p.side === 'left' ? -1 : 1, o = clamp(p.open, 0, 0.9);
    const xB = s * (iw / 2 - pw / 2) + s * o * pw, xA = -s * (iw / 2 - pw / 2) + s * o * iw;
    for (const [x, z, lead] of [[xB, -0.02, false], [xA, 0.02, true]]) {
      k.box('leaf', p.leafMat, pw, lh, lt, x, 0.008 + lh / 2, z, { r: 0.003, segs: 2 });
      for (const f of [-1, 1]) {
        for (const fy of [0.25, 0.5, 0.75]) k.box('groove', 'plastic-black', pw - 0.1, 0.006, 0.002, x, 0.008 + lh * fy, z + f * (lt / 2 + 0.0005), { r: 0 });
        if (lead) k.rbox('hardware', 'metal-steel', 0.04, 0.16, 0.006, 0.004, x - s * (pw / 2 - 0.06), 1.0, z + f * (lt / 2 + 0.001), { segs: k.seg(2, 1) });
      }
    }
    k.box('frame', 'metal-black', iw, 0.02, 0.09, 0, H - JAMB - 0.01, 0, { r: 0.002 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const engawa = item({
  id: 'door-engawa-glass', category: 'doors', placement: 'opening', ko: '툇마루 4짝 유리 미닫이(엔가와)', en: 'Engawa four-panel sliding glass doors',
  bboxSlack: [0.02, 0.02, 0.04],
  params: [...doorCommon(3.2, 2.0, [2.0, 4.8], [1.8, 2.4]), slideOpen(), mat('leafMat', '문살', 'Panels', 'wood-pine'), mat('frameMat', '문틀', 'Frame', 'wood-dark'), glassP('glass-clear')],
  tags: ['door', 'engawa door', 'japanese sliding door', 'veranda door', 'sliding door', '문', '툇마루 문', '유리 미닫이', '엔가와', '4짝 미닫이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fb = 0.05;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fb, H, t, s * (W / 2 - fb / 2), H / 2, 0, { r: 0.002 });
    k.box('frame', p.frameMat, W - 2 * fb, 0.07, t, 0, H - 0.035, 0, { r: 0.002 });
    k.box('frame', p.frameMat, W - 2 * fb, 0.04, t, 0, 0.02, 0, { r: 0.002 });
    for (const z of [-0.05, 0, 0.05]) k.box('frame', p.frameMat, W - 2 * fb, 0.006, 0.012, 0, 0.043, z, { r: 0.001 });
    const iw = W - 2 * fb, pw = iw / 4 + 0.03, ph = H - 0.07 - 0.04 - 0.006, o = clamp(p.open, 0, 0.9) * (pw - 0.06);
    const spec = { stile: 0.04, rows: [{ rail: 0.08 }, { type: 'solid', h: 0.3 }, { rail: 0.03 }, { type: 'glass', w: 1, grid: [1, 3], mw: 0.018, glass: p.glassMat }, { rail: 0.05 }] };
    for (let i = 0; i < 4; i++) {
      const outer = i === 0 || i === 3;
      const x = -iw / 2 + pw / 2 + (i * (iw - pw)) / 3 + (i === 0 ? o : i === 3 ? -o : 0), z = outer ? 0.028 : -0.028;
      withMatrix(k, M4(0, 0.046, 0), () => specLeaf(k, spec, { lw: pw, lh: ph, lt: 0.03, X: (u) => x - pw / 2 + u, zc: z, mat: p.leafMat, glass: p.glassMat }));
      if (outer) for (const f of [-1, 1]) k.box('hardware', p.frameMat, 0.025, 0.09, 0.003, x + (i === 0 ? 1 : -1) * (pw / 2 - 0.07), 0.95, z + f * 0.0165, { r: 0 });
    }
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

const hanokSlide = item({
  id: 'door-hanok-sesal-sliding', category: 'doors', placement: 'opening', ko: '한옥 세살 미닫이문(2짝)', en: 'Korean hanok sesal lattice sliding doors',
  bboxSlack: [0.02, 0.02, 0.04],
  params: [...doorCommon(1.6, 2.0, [1.0, 2.8], [1.7, 2.4]), slideOpen(), mat('leafMat', '문살', 'Lattice', 'wood-pine'), mat('frameMat', '문얼굴', 'Frame', 'wood-dark')],
  tags: ['door', 'hanok door', 'korean sliding door', 'lattice door', 'sliding door', '문', '한옥 문', '세살문', '미닫이문', '창호지 문', '전통 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fb = 0.07;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fb, H, t, s * (W / 2 - fb / 2), H / 2, 0, { r: 0.003 });
    k.box('frame', p.frameMat, W - 2 * fb, 0.09, t, 0, H - 0.045, 0, { r: 0.003 });
    k.box('frame', p.frameMat, W - 2 * fb, 0.06, t, 0, 0.03, 0, { r: 0.003 });
    const iw = W - 2 * fb, pw = iw / 2 + 0.03, ph = H - 0.09 - 0.06 - 0.006, o = clamp(p.open, 0, 0.9) * (pw - 0.05);
    const nv = Math.max(4, Math.round((pw - 0.1) / 0.045));
    const spec = { stile: 0.05, rows: [{ rail: 0.06 }, { type: 'solid', h: 0.26 }, { rail: 0.04 }, { type: 'lattice', grid: [nv, 3], bw: 0.012 }, { rail: 0.05 }] };
    for (const [s, z, off] of [[-1, -0.025, 0], [1, 0.025, o]]) {
      const xc = s * (iw / 2 - pw / 2) - off;
      withMatrix(k, M4(0, 0.062, 0), () => specLeaf(k, spec, { lw: pw, lh: ph, lt: 0.032, X: (u) => xc - pw / 2 + u, zc: z, mat: p.leafMat }));
      for (const f of [-1, 1]) ringPull(k, 'metal-black', xc - s * (pw / 2 - 0.07), 1.0, z + f * 0.016, f, 0.03);
    }
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'left' };
    return k.group();
  },
});

const barnBipart = item({
  id: 'door-barn-bipart', category: 'doors', placement: 'opening', ko: '양쪽 열림 바니 도어(2짝)', en: 'Bi-parting barn doors',
  bboxSlack: [1.4, 0.25, 0.12], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.6, 2.1, [1.2, 2.4], [1.8, 2.6]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), mat('leafMat', '문짝', 'Leaves', 'wood-oak'), mat('trackMat', '레일', 'Track', 'metal-black', 'metal')],
  tags: ['barn door', 'double barn door', 'bi-parting barn door', 'sliding door', '바니 도어', '양쪽 바니 도어', '슬라이딩 도어', '2짝 행거 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.04;
    doorFrame(k, W, H, t, 'wood-white', { casing: false });
    const lw = W / 2 + 0.05, lh = H + 0.05, zl = t / 2 + 0.03 + lt / 2, ty = lh + 0.12;
    const xs = [-1, 1].map((s) => s * (lw / 2) + s * clamp(p.open, 0, 1) * lw);
    barnRail(k, t, { tl: 4 * lw + 0.1, tx: 0, ty, mat: p.trackMat, leaves: xs, lw, zl, lt });
    xs.forEach((x, i) => {
      const s = i ? 1 : -1, np = Math.max(3, Math.round(lw / 0.15)), bw = lw / np;
      for (let j = 0; j < np; j++) k.box('leaf', p.leafMat, bw - 0.003, lh, lt, x - lw / 2 + bw * (j + 0.5), 0.01 + lh / 2, zl, { r: 0.003 });
      for (const by of [0.16, lh / 2, lh - 0.16]) k.box('leaf', p.leafMat, lw - 0.04, 0.14, 0.02, x, 0.01 + by, zl + lt / 2 + 0.01, { r: 0.003 });
      pullBar(k, p.trackMat, x - s * (lw / 2 - 0.08), 1.0, zl + lt / 2 + 0.02, 1, 0.35, { r: 0.012, off: 0.045 });
    });
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

const GT = { stile: 0.11, rows: [{ rail: 0.12 }, { type: 'solid', w: 1.3 }, { rail: 0.1 }, { type: 'glass', w: 1, grid: [2, 2] }, { rail: 0.11 }] };
const barnGlassTop = item({
  id: 'door-barn-glass-top', category: 'doors', placement: 'opening', ko: '상부 유리 바니 도어', en: 'Barn door with glazed top',
  bboxSlack: [1.1, 0.25, 0.12], anchor: { asymmetricX: true, asymmetricZ: true },
  params: [...doorCommon(0.9, 2.1), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), slideSide('right'), mat('leafMat', '문짝', 'Leaf', 'wood-walnut'), mat('trackMat', '레일', 'Track', 'metal-black', 'metal')],
  tags: ['barn door', 'glass barn door', 'sliding door', 'farmhouse door', '바니 도어', '유리 바니 도어', '슬라이딩 도어', '행거 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.04;
    doorFrame(k, W, H, t, 'wood-white', { casing: false });
    const s = p.side === 'left' ? -1 : 1, lw = W + 0.1, lh = H + 0.05, zl = t / 2 + 0.03 + lt / 2, ty = lh + 0.12;
    const x = s * clamp(p.open, 0, 1) * lw;
    barnRail(k, t, { tl: 2 * lw + 0.1, tx: (s * lw) / 2, ty, mat: p.trackMat, leaves: [x], lw, zl, lt });
    withMatrix(k, M4(0, 0.01, 0), () => {
      specLeaf(k, GT, { lw, lh, lt, X: (u) => x - lw / 2 + u, zc: zl, mat: p.leafMat });
      const f = rowYs(GT.rows, lh)[1], fw = lw - 0.22, n = Math.max(3, Math.round(fw / 0.12));
      for (let i = 1; i < n; i++) for (const e of [-1, 1]) k.box('groove', 'wood-dark', 0.006, f.h - 0.01, 0.002, x - lw / 2 + 0.11 + (fw * i) / n, f.cy, zl + e * (lt / 2 + 0.001), { r: 0 });
    });
    pullBar(k, p.trackMat, x - s * (lw / 2 - 0.08), 1.0, zl + lt / 2, 1, 0.35, { r: 0.012, off: 0.045 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

/* --------------------------------------------------------- pivot / revolving */

const pivotSteel = item({
  id: 'door-pivot-steel', category: 'doors', placement: 'opening', ko: '철제 격자 유리 피벗 도어', en: 'Steel-grid glass pivot door',
  bboxSlack: [0.04, 0.03, 0.08], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.1, 2.4, [0.9, 1.8], [2.0, 3.0]), openParam(), mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal'), glassP('glass-clear'), mat('handleMat', '손잡이 재질', 'Pull finish', 'metal-black', 'metal')],
  tags: ['door', 'pivot door', 'steel glass door', 'crittall pivot', 'industrial door', '문', '피벗 도어', '철제 유리문', '격자 피벗문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, fj = 0.02;
    doorFrame(k, W, H, t, p.frameMat, { casing: false, jamb: fj });
    k.box('threshold', 'metal-steel', W - 2 * fj, 0.01, t, 0, 0.005, 0, { r: 0.002 });
    const lw = W - 2 * fj - 0.01, lh = H - fj - 0.02, pv = lw * 0.25, px = -lw / 2 + pv;
    const m = pivot(0, 0, 0, { ry: -p.open * DEG });
    m.premultiply(M4(px, 0.012, 0));
    withMatrix(k, m, () => {
      const x0 = -pv, cx = x0 + lw / 2;
      ring(k, 'leaf', p.frameMat, lw, lh, 0.06, 0.05, cx, lh / 2, 0);
      k.box('glass', p.glassMat, lw - 0.11, lh - 0.11, 0.01, cx, lh / 2, 0, { r: 0 });
      for (let c = 1; c < 3; c++) k.box('leaf', p.frameMat, 0.02, lh - 0.12, 0.03, x0 + 0.06 + ((lw - 0.12) * c) / 3, lh / 2, 0, { r: 0.002 });
      for (let r = 1; r < 6; r++) k.box('leaf', p.frameMat, lw - 0.12, 0.02, 0.03, cx, 0.06 + ((lh - 0.12) * r) / 6, 0, { r: 0.002 });
      for (const s of [-1, 1]) pullBar(k, p.handleMat, x0 + lw - 0.12, 1.05, s * 0.025, s, Math.min(1.2, lh - 0.6), { r: 0.014, off: 0.06 });
      for (const y of [-0.006, lh]) k.cyl('hardware', 'metal-steel', 0.02, 0.02, 0.008, 0, y, 0, { segs: k.seg(14, 6) });
    });
    k.userData.swing = { hinge: 'left', radius: lw - pv, pivot: pv };
    return k.group();
  },
});

const revolving = item({
  id: 'door-revolving', category: 'doors', placement: 'opening', ko: '회전문(4날개)', en: 'Four-wing revolving door',
  bboxSlack: [0.04, 0.03, 1.0],
  params: [...doorCommon(2.0, 2.3, [1.6, 2.8], [2.1, 2.8]), P.num('rotation', '날개 각도(°)', 'Wing angle (°)', 45, 0, 90, 1), mat('frameMat', '프레임', 'Frame', 'metal-aluminium', 'metal'), glassP('glass-clear')],
  tags: ['door', 'revolving door', 'rotating door', 'hotel entrance', 'lobby door', '문', '회전문', '호텔 출입문', '로비 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, R = W / 2 - 0.015, hc = 0.2, hg = H - hc - 0.012;
    linings(k, W, H, t, 0, 'paint-white-matte');
    k.cyl('floor', 'granite-grey', R, R, 0.012, 0, 0, 0, { segs: k.seg(48, 16) });
    k.cyl('canopy', p.frameMat, R + 0.01, R + 0.01, hc, 0, H - hc, 0, { segs: k.seg(48, 16) });
    const span = 100 * DEG, ns = k.seg(10, 5), d = span / ns;
    for (const c0 of [0, PI]) {
      for (let i = 0; i < ns; i++) {
        const th = c0 - span / 2 + d * (i + 0.5), rr = R * Math.cos(d / 2);
        k.box('glass', p.glassMat, 2 * R * Math.sin(d / 2) + 0.002, hg, 0.012, rr * Math.sin(th), 0.012 + hg / 2, rr * Math.cos(th), { r: 0, ry: th });
      }
      for (const e of [-1, 1]) { const th = c0 + (e * span) / 2; k.cyl('frame', p.frameMat, 0.025, 0.025, hg, R * Math.sin(th), 0.012, R * Math.cos(th), { segs: k.seg(12, 6) }); }
    }
    k.cyl('frame', p.frameMat, 0.05, 0.05, hg, 0, 0.012, 0, { segs: k.seg(16, 8) });
    const wl = R - 0.12;
    for (let i = 0; i < 4; i++) {
      withMatrix(k, M4(0, 0.012, 0).multiply(RY(p.rotation * DEG + (i * PI) / 2)), () => {
        ring(k, 'wings', p.frameMat, wl, hg - 0.02, 0.04, 0.04, 0.05 + wl / 2, (hg - 0.02) / 2, 0);
        k.box('glass', p.glassMat, wl - 0.07, hg - 0.09, 0.01, 0.05 + wl / 2, (hg - 0.02) / 2, 0, { r: 0 });
        for (const s of [-1, 1]) k.rod('wings', 'metal-steel', [0.2, 1.0, s * 0.045], [wl - 0.05, 1.0, s * 0.045], 0.012, { segs: k.seg(10, 5) });
      });
    }
    k.userData.swing = { hinge: 'none', radius: 0 };
    return k.group();
  },
});

/* ------------------------------------------------------------ overhead doors */

const rollerShutter = item({
  id: 'door-roller-shutter', category: 'doors', placement: 'opening', ko: '롤러 셔터 도어(상가·차고)', en: 'Roller shutter door',
  bboxSlack: [0.12, 0.4, 0.25], anchor: { asymmetricZ: true },
  params: [...doorCommon(2.6, 2.3, [1.5, 5.0], [1.9, 3.0]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), mat('slatMat', '셔터 날개', 'Slats', 'metal-aluminium', 'metal'), mat('boxMat', '셔터 박스', 'Coil box', 'metal-white', 'metal')],
  tags: ['door', 'roller shutter', 'rolling door', 'shop shutter', 'garage door', '문', '셔터', '롤러 셔터', '상가 셔터', '차고 셔터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, z0 = t / 2 + 0.035;
    linings(k, W, H, t, 0, 'paint-white-matte');
    for (const s of [-1, 1]) k.box('guide', p.boxMat, 0.05, H, 0.07, s * (W / 2 + 0.025), H / 2, z0, { r: 0.003 });
    k.box('box', p.boxMat, W + 0.16, 0.34, 0.36, 0, H + 0.17, t / 2 + 0.18, { r: 0.01, segs: 2 });
    const y0 = clamp(p.open, 0, 1) * (H - 0.12), pitch = 0.075;
    k.box('bar', 'metal-black', W + 0.04, 0.06, 0.03, 0, y0 + 0.03, z0, { r: 0.004 });
    k.rbox('hardware', 'metal-black', 0.16, 0.03, 0.03, 0.008, 0, y0 + 0.03, z0 - 0.03, { segs: k.seg(2, 1) });
    for (let i = 0; ; i++) {
      const yb = y0 + 0.06 + pitch * i;
      const h = Math.min(pitch - 0.006, H - yb);
      if (h < 0.01) break;
      k.box('slats', p.slatMat, W + 0.04, h, 0.016, 0, yb + h / 2, z0, { r: 0.004, segs: 2 });
    }
    k.userData.swing = { hinge: 'none', radius: 0, overhead: true };
    return k.group();
  },
});

const tiltGarage = item({
  id: 'door-tilt-garage', category: 'doors', placement: 'opening', ko: '틸트업 차고문(일체형 캐노피)', en: 'Tilt-up (canopy) garage door',
  bboxSlack: [0.05, 0.05, 0.1], anchor: { asymmetricZ: true },
  params: [...doorCommon(2.4, 2.1, [2.0, 5.0], [1.9, 2.6]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), mat('leafMat', '도어 패널', 'Panel', 'paint-white-gloss'), mat('trimMat', '문틀', 'Frame', 'paint-white-gloss')],
  tags: ['door', 'garage door', 'tilt up door', 'up and over door', 'canopy door', '문', '차고 문', '틸트 도어', '어퍼 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, pt = 0.04;
    linings(k, W, H, t, 0, 'paint-white-matte');
    for (const s of [-1, 1]) k.box('frame', p.trimMat, 0.05, H, 0.12, s * (W / 2 - 0.037), H / 2, 0, { r: 0.003 });
    k.box('frame', p.trimMat, W - 0.024, 0.05, 0.12, 0, H - 0.025, 0, { r: 0.003 });
    const pw = W - 0.024 - 0.1 - 0.01, L = H - 0.05 - 0.03, a = clamp(p.open, 0, 1) * (PI / 2);
    const qy = 0.015 + L / 3 + clamp(p.open, 0, 1) * (H - 0.05 - pt / 2 - 0.005 - 0.015 - L / 3);
    withMatrix(k, M4(0, qy, 0).multiply(new THREE.Matrix4().makeRotationX(a)), () => {
      k.box('panels', p.leafMat, pw, L, pt, 0, L / 6, 0, { r: 0.004, segs: 2 });
      const n = Math.max(6, Math.round(pw / 0.12));
      for (let i = 0; i < n; i++) k.box('panels', p.leafMat, 0.03, L - 0.06, 0.012, -pw / 2 + (pw * (i + 0.5)) / n, L / 6, -pt / 2 - 0.006, { r: 0.002 });
      k.rbox('hardware', 'metal-black', 0.16, 0.03, 0.03, 0.008, 0, -L / 3 + 0.15, -pt / 2 - 0.027, { segs: k.seg(2, 1) });
      for (const s of [-1, 1]) k.box('hardware', 'metal-steel', 0.03, 0.12, 0.05, s * (pw / 2 - 0.015), 0, 0, { r: 0.003 });
    });
    k.userData.swing = { hinge: 'none', radius: 0, overhead: true };
    return k.group();
  },
});

/* ---------------------------------------------------------------- doorways */

const moonGate = item({
  id: 'door-moon-gate', category: 'doors', placement: 'opening', ko: '원형 문(월동문·문 없음)', en: 'Moon gate (round doorway)',
  bboxSlack: [0.04, 0.03, 0.08],
  params: [...doorCommon(2.0, 1.9, [1.2, 2.8], [1.5, 2.8]), mat('lining', '벽면 마감', 'Wall finish', 'wall-paint-white'), mat('frameMat', '테두리', 'Ring moulding', 'wood-dark')],
  tags: ['opening', 'moon gate', 'round doorway', 'circular opening', 'chinese garden', '문 없음', '원형 문', '월동문', '둥근 입구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, n = k.seg(64, 20);
    const R = W / 2 - 0.03, cy = H - 0.03 - R, full = cy - R > 0.005;
    const th0 = full ? -PI / 2 : Math.asin(clamp(-cy / R, -1, 1)), th1 = PI - th0;
    const arc = (r, a0, a1, m) => Array.from({ length: m + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / m; return [r * Math.cos(a), cy + r * Math.sin(a)]; });
    let shape;
    if (full) {
      shape = new THREE.Shape([V2(-W / 2, 0), V2(W / 2, 0), V2(W / 2, H), V2(-W / 2, H)]);
      shape.holes.push(new THREE.Path(arc(R, th0, th1, n).slice(0, -1).map(([x, y]) => V2(x, y))));
    } else {
      shape = new THREE.Shape([V2(W / 2, 0), V2(W / 2, H), V2(-W / 2, H), V2(-W / 2, 0), ...arc(R, th1, th0, n).map(([x, y]) => V2(x, Math.max(0, y)))]);
    }
    k.panel('lining', p.lining, shape, t, 0, 0, 0, { bevel: 0 });
    const Rr = R + 0.02, t0 = full ? th0 : Math.asin(clamp((0.025 - cy) / Rr, -1, 1));
    for (const s of [-1, 1]) {
      const pts = arc(Rr, t0, full ? t0 + PI * 2 : PI - t0, k.seg(48, 16)).map(([x, y]) => [x, y, s * (t / 2 + 0.012)]);
      if (full) pts.pop();
      k.tube('trim', p.frameMat, pts, 0.025, { closed: full, radial: k.seg(10, 5), segs: k.seg(64, 20) });
    }
    k.userData.swing = { hinge: 'none', radius: 0 };
    return k.group();
  },
});

const beadCurtain = item({
  id: 'door-bead-curtain', category: 'doors', placement: 'opening', ko: '구슬 발 출입구(비즈 커튼)', en: 'Bead curtain doorway',
  bboxSlack: DOOR_SLACK(0.2),
  params: [...doorCommon(0.9, 2.1, [0.6, 1.6], [1.8, 2.5]), mat('beadMat', '구슬', 'Beads', 'wood-teak'), mat('frameMat', '문틀', 'Frame', 'wood-white')],
  tags: ['opening', 'bead curtain', 'beaded doorway', 'door curtain', '문 없음', '구슬 발', '비즈 커튼', '출입구 발'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, iw = W - 2 * JAMB, yr = H - JAMB - 0.03;
    doorFrame(k, W, H, t, p.frameMat);
    k.rod('rod', 'metal-brass', [-iw / 2, yr, 0], [iw / 2, yr, 0], 0.01, { segs: k.seg(12, 6) });
    const n = Math.min(k.hi ? 24 : 14, Math.max(4, Math.floor((iw - 0.04) / 0.04))), L = yr - 0.04, step = k.hi ? 0.04 : 0.08;
    const prof = [[0, 0]];
    for (let y = 0.004; y < L - step; y += step) prof.push([0.009, y + step * 0.25], [0.003, y + step * 0.75]);
    prof.push([0.003, L], [0, L]);
    for (let i = 0; i < n; i++) k.lathe('beads', p.beadMat, prof, -iw / 2 + 0.02 + ((iw - 0.04) * (i + 0.5)) / n, 0.03, 0, { segs: k.seg(6, 3) });
    k.userData.swing = { hinge: 'none', radius: 0 };
    return k.group();
  },
});

const noren = item({
  id: 'door-noren', category: 'doors', placement: 'opening', ko: '노렌 천 가림막 출입구', en: 'Noren fabric doorway curtain',
  bboxSlack: DOOR_SLACK(0.2),
  params: [...doorCommon(0.9, 2.0, [0.6, 1.8], [1.8, 2.5]), P.int('panels', '천 갈래', 'Panels', 2, 1, 4), P.len('drop', '천 길이', 'Length', 0.9, 0.4, 1.6),
    mat('fabric', '천', 'Fabric', 'fabric-navy', 'fabric'), mat('frameMat', '문틀', 'Frame', 'wood-ash')],
  tags: ['opening', 'noren', 'door curtain', 'japanese curtain', 'fabric doorway', '문 없음', '노렌', '천 가림막', '주방 가림막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, iw = W - 2 * JAMB, yr = H - JAMB - 0.04, zr = t / 2 - 0.03;
    doorFrame(k, W, H, t, p.frameMat);
    k.rod('rod', p.frameMat, [-iw / 2, yr, zr], [iw / 2, yr, zr], 0.014, { segs: k.seg(12, 6) });
    const n = clamp(Math.round(p.panels), 1, 4), gap = 0.012, pw = (iw - 0.02 - gap * (n - 1)) / n, drop = clamp(p.drop, 0.3, yr - 0.4);
    for (let i = 0; i < n; i++) {
      const x0 = -iw / 2 + 0.01 + i * (pw + gap);
      k.add('fabric', p.fabric, shellGeo(k.seg(10, 4), k.seg(8, 3), (u, v) => [x0 + u * pw, yr + 0.015 - v * (drop + 0.015), zr + 0.017 + 0.012 * Math.sin(u * PI * 2 + v * 1.5) * v], 0.003));
    }
    k.userData.swing = { hinge: 'none', radius: 0 };
    return k.group();
  },
});

/* -------------------------------------------------------------- ship door */

const ship = item({
  id: 'door-ship-watertight', category: 'doors', placement: 'opening', ko: '선박형 수밀 문(라운드 철문)', en: 'Ship-style watertight door',
  bboxSlack: [0.06, 0.04, 0.12], anchor: { asymmetricZ: true },
  params: [...doorCommon(0.8, 1.9, [0.6, 1.0], [1.6, 2.2]), hingeParam(), openParam(),
    mat('leafMat', '문짝', 'Leaf', 'paint-grey-matte'), mat('frameMat', '문틀', 'Frame', 'paint-grey-matte'), mat('handleMat', '레버', 'Dogs', 'metal-steel', 'metal')],
  tags: ['door', 'ship door', 'watertight door', 'bulkhead door', 'nautical door', '문', '선박 문', '수밀 문', '해치 도어', '노티컬'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, hc = 0.22, lt = 0.04;
    const hw = W - 0.14, hh = H - hc - 0.08, yc = hc + hh / 2, rr = Math.min(0.2, hw * 0.3);
    const holeOf = (w, h, r) => new THREE.Path(roundRect(w, h, r).getPoints(8).map((q) => V2(q.x, q.y + yc)));
    const plate = new THREE.Shape([V2(-W / 2, 0), V2(W / 2, 0), V2(W / 2, H), V2(-W / 2, H)]);
    plate.holes.push(holeOf(hw, hh, rr));
    k.panel('frame', p.frameMat, plate, t, 0, 0, 0, { bevel: 0.002 });
    for (const side of [-1, 1]) {
      const lip = new THREE.Shape(roundRect(hw + 0.1, hh + 0.1, rr + 0.05).getPoints(8).map((q) => V2(q.x, q.y + yc)));
      lip.holes.push(holeOf(hw, hh, rr));
      k.panel('frame', p.frameMat, lip, 0.016, 0, 0, side * (t / 2 + 0.008), { bevel: 0.003 });
    }
    const lw = hw + 0.06, lhh = hh + 0.06, zFace = t / 2 + 0.016, dir = p.hinge === 'right' ? -1 : 1, hx = dir * -(lw / 2);
    const m = pivot(0, 0, 0, { ry: -dir * p.open * DEG });
    m.premultiply(M4(hx, 0, zFace));
    withMatrix(k, m, () => {
      const X = (x) => dir * x, zc = lt / 2, cx = X(lw / 2);
      k.panel('leaf', p.leafMat, roundRect(lw, lhh, rr + 0.03), lt, cx, yc, zc, { bevel: 0.004 });
      const gk = roundRect(lw - 0.02, lhh - 0.02, rr + 0.02);
      gk.holes.push(new THREE.Path(roundRect(lw - 0.08, lhh - 0.08, Math.max(0.02, rr - 0.01)).getPoints(8)));
      k.panel('gasket', 'rubber-black', gk, 0.008, cx, yc, -0.004, { bevel: 0 });
      for (const e of [-1, 1]) k.box('leaf', p.leafMat, lw - 0.12, 0.05, 0.02, cx, yc + e * hh * 0.25, lt + 0.01, { r: 0.004 });
      const dogs = [[lw - 0.035, yc - hh * 0.3], [lw - 0.035, yc], [lw - 0.035, yc + hh * 0.3], [lw / 2, yc + lhh / 2 - 0.035], [lw / 2, yc - lhh / 2 + 0.035]];
      for (const [x, y] of dogs) {
        k.cyl('hardware', p.handleMat, 0.018, 0.018, 0.03, X(x), y, lt, { rx: PI / 2, segs: k.seg(12, 6) });
        k.rbox('hardware', p.handleMat, 0.1, 0.022, 0.018, 0.006, X(x) - dir * 0.04, y, lt + 0.035, { segs: k.seg(2, 1) });
      }
      k.rbox('hardware', p.handleMat, 0.16, 0.035, 0.03, 0.01, X(lw - 0.14), yc, lt + 0.06, { segs: k.seg(2, 1) });
      k.cyl('hardware', p.handleMat, 0.025, 0.025, 0.06, X(lw - 0.14), yc, lt, { rx: PI / 2, segs: k.seg(12, 6) });
      for (const y of [yc - hh * 0.3, yc + hh * 0.3]) k.cyl('hardware', p.handleMat, 0.025, 0.025, 0.18, X(-0.02), y - 0.09, zc, { segs: k.seg(14, 6) });
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

/* ----------------------------------------------------------------- export */

export const ITEMS = [
  studded, deco, craftsman, victorian, cane, mirrorDoor, chalk, slimAlu, invisible, cubicle, hospital, exitDouble, coldRoom, diamond,
  plankH, leather, riveted, sauna, screenDoor, grille, entranceStrip, smartDoor, transom, doubleSide, gate, carriage, vault, chinese,
  chevron, wine, archedDouble, gothic, jmSwing, jm3, jmAuto, autoSliding, showerHinged, showerSliding, showerBifold, showerPivot,
  slideGlassWall, liftSlide, oxxo, pocketTele, engawa, hanokSlide, barnBipart, barnGlassTop, pivotSteel, revolving, rollerShutter,
  tiltGarage, moonGate, beadCurtain, noren, ship,
].map(autoSize);

