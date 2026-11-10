// More doors (placement 'opening'): new designs + preset variants of openings.js / this file.
// Same conventions as openings.js: origin = bottom centre of the wall hole (params width / height
// = hole size), z = 0 is the wall's mid plane, +Z is the room side; frames fill the reveal
// (ctx.wallThickness), casings overlap the wall faces (stated in bboxSlack).
import { THREE, Kit, item, P, OPT, variant, clamp, frameShape } from './helpers.js';
import {
  ITEMS as BASE, DEG, wallT, withMatrix, pivot, ring, doorFrame, doorStops, addLever, linings,
  JAMB, DOOR_SLACK, hingeParam, openParam,
} from './openings.js';

const GAP = 0.003;
const M4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const baseOf = (id) => BASE.find((e) => e.id === id);
const V2 = (x, y) => new THREE.Vector2(x, y);

/* ------------------------------------------------------------ arch shapes */

/** Circle through the springing points of a segmental arch: span w, springing y ys, rise. */
export function archCircle(w, ys, rise) {
  const r = clamp(rise, 0.02, w / 2);
  const R = (w * w / 4 + r * r) / (2 * r);
  return { R, cx: 0, cy: ys + r - R };
}
/** Points on the upper arc of a circle (cx, cy, R) from x = xR to x = xL (right → left). */
export function arcPts(cx, cy, R, xR, xL, n) {
  const a1 = Math.acos(clamp((xR - cx) / R, -1, 1)), a2 = Math.acos(clamp((xL - cx) / R, -1, 1));
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a1 + (a2 - a1) * (i / n); out.push(V2(cx + R * Math.cos(a), cy + R * Math.sin(a))); }
  return out;
}
/** Region under an arch: rectangle from y0 up to the springing line, arched top (circle c). */
export function archedShape(w, y0, c, n, x0 = 0) {
  const ys = c.cy + Math.sqrt(Math.max(0, c.R * c.R - (w / 2) ** 2));
  return new THREE.Shape([V2(x0 - w / 2, y0), V2(x0 + w / 2, y0), ...arcPts(x0 + c.cx, c.cy, c.R, x0 + w / 2, x0 - w / 2, n)]);
}
/** Spandrel infill between an arch (circle c, span w) and a flat top at y = top. */
export function spandrelShape(w, c, top, n) {
  const ys = c.cy + Math.sqrt(Math.max(0, c.R * c.R - (w / 2) ** 2));
  const arc = arcPts(c.cx, c.cy, c.R, w / 2, -w / 2, n).reverse();
  return new THREE.Shape([V2(w / 2, ys), V2(w / 2, top), V2(-w / 2, top), V2(-w / 2, ys), ...arc.slice(1, -1)]);
}
/** An arched casing band: legs from y0, inner edge on circle c over span w, band width b. */
export function archBand(w, c, b, y0, n) {
  const ysI = c.cy + Math.sqrt(Math.max(0, c.R * c.R - (w / 2) ** 2));
  const Ro = c.R + b, xo = w / 2 + b;
  const ysO = c.cy + Math.sqrt(Math.max(0, Ro * Ro - xo * xo));
  const inner = arcPts(c.cx, c.cy, c.R, w / 2, -w / 2, n).reverse();
  const outer = arcPts(c.cx, c.cy, Ro, xo, -xo, n);
  return new THREE.Shape([V2(-xo, y0), V2(-w / 2, y0), V2(-w / 2, ysI), ...inner.slice(1, -1), V2(w / 2, ysI), V2(w / 2, y0), V2(xo, y0), V2(xo, ysO), ...outer.slice(1, -1), V2(-xo, ysO)]);
}
/** Ring between two concentric arcs above the line y = ys (a fanlight sash). */
export function arcRing(c, b, ys, n) {
  const xo = Math.sqrt(Math.max(1e-6, c.R * c.R - (ys - c.cy) ** 2));
  const Ri = c.R - b, xi = Math.sqrt(Math.max(1e-6, Ri * Ri - (ys - c.cy) ** 2));
  return new THREE.Shape([...arcPts(c.cx, c.cy, c.R, xo, -xo, n), ...arcPts(c.cx, c.cy, Ri, -xi, xi, n)]);
}
export function circleShape(r, x = 0, y = 0, hole = 0) {
  const s = new THREE.Shape();
  s.absarc(x, y, r, 0, Math.PI * 2, false);
  if (hole) { const h = new THREE.Path(); h.absarc(x, y, hole, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}

/* ---------------------------------------------------------- leaf builders */

/**
 * One panel field inside a leaf (local leaf coords mapped by X). Types: raised, flat, solid,
 * glass, frost, tint, mirror, louvre, lattice (paper + bars; pattern 'grid' | 'ddisal').
 */
export function field(k, f, { X, cx, cy, fw, fh, lt, zc, mat, glass = 'glass-clear' }) {
  const x = X(cx);
  const t = f.type;
  if (t === 'raised') {
    k.box('leaf', mat, fw + 0.004, fh + 0.004, lt * 0.4, x, cy, zc, { r: 0.001 });
    k.rbox('leaf', mat, Math.max(0.02, fw - 0.03), Math.max(0.02, fh - 0.03), lt * 0.72, 0.012, x, cy, zc, { segs: k.seg(3, 1) });
    ring(k, 'leaf', mat, fw, fh, 0.01, lt * 0.82, x, cy, zc);
  } else if (t === 'flat') {
    k.box('leaf', mat, fw + 0.004, fh + 0.004, lt * 0.42, x, cy, zc, { r: 0.001 });
  } else if (t === 'solid') {
    k.box('leaf', mat, fw, fh, lt, x, cy, zc, { r: 0.002 });
  } else if (t === 'mirror') {
    k.box('leaf', mat, fw + 0.004, fh + 0.004, lt * 0.42, x, cy, zc - lt * 0.1, { r: 0.001 });
    k.box('mirror', 'mirror', fw - 0.004, fh - 0.004, 0.005, x, cy, zc + lt * 0.11 + 0.0026, { r: 0 });
    ring(k, 'leaf', mat, fw, fh, 0.012, lt * 0.8, x, cy, zc, { bevel: 0.003 });
  } else if (t === 'louvre') {
    const n = Math.max(3, Math.round(fh / 0.032)), pitch = fh / n;
    for (let i = 0; i < n; i++) k.box('leaf', mat, fw + 0.004, 0.007, lt * 0.8, x, cy - fh / 2 + pitch * (i + 0.5), zc, { r: 0, rx: -0.75 });
  } else if (t === 'lattice') {
    const d = lt * 0.5, bw = f.bw ?? 0.016;
    k.box('paper', 'paper', fw + 0.006, fh + 0.006, 0.002, x, cy, zc - d / 2 - 0.0013, { r: 0 });
    const ddi = f.pattern === 'ddisal';
    const nv = ddi ? Math.max(2, Math.round(fw / 0.034)) : f.grid[0];
    for (let i = 1; i < nv; i++) k.box('leaf', mat, bw, fh, d, X(cx - fw / 2 + (fw * i) / nv), cy, zc, { r: 0.001 });
    if (ddi) {
      for (const yf of [0.08, 0.5, 0.92]) for (let j = 0; j < 4; j++) {
        const y = cy - fh / 2 + fh * yf + (j - 1.5) * 0.03;
        if (Math.abs(y - cy) < fh / 2 - 0.01) k.box('leaf', mat, fw, bw, d, x, y, zc, { r: 0.001 });
      }
    } else {
      for (let j = 1; j < f.grid[1]; j++) k.box('leaf', mat, fw, bw, d, x, cy - fh / 2 + (fh * j) / f.grid[1], zc, { r: 0.001 });
    }
  } else {
    // glass-like fields: pane + glazing bead (+ muntin grid)
    const g = t === 'frost' ? 'glass-frosted' : t === 'tint' ? 'glass-tinted' : (f.glass ?? glass);
    k.box('glass', g, fw + 0.01, fh + 0.01, 0.008, x, cy, zc, { r: 0 });
    ring(k, 'leaf', mat, fw, fh, 0.012, lt * 0.75, x, cy, zc, { bevel: 0.003 });
    if (f.grid) {
      const [C, R] = f.grid, mw = f.mw ?? 0.022;
      for (let i = 1; i < C; i++) k.box('leaf', mat, mw, fh, lt * 0.6, X(cx - fw / 2 + (fw * i) / C), cy, zc, { r: 0.003 });
      for (let j = 1; j < R; j++) k.box('leaf', mat, fw, mw, lt * 0.6, x, cy - fh / 2 + (fh * j) / R, zc, { r: 0.003 });
    }
  }
}

/**
 * Stile-and-rail leaf: two stiles + rows from the bottom: { rail: m } (solid rail), or a field
 * row { type, w (weight) | h (metres), cols, mw (muntin), grid, ... }. Leaf spans x ∈ [0, lw] via X.
 */
export function specLeaf(k, spec, o) {
  const { lw, lh, lt, X, zc, mat } = o;
  const st = Math.min(spec.stile ?? 0.12, lw * 0.36);
  for (const s of [0, 1]) k.box('leaf', mat, st, lh, lt, X(s ? lw - st / 2 : st / 2), lh / 2, zc, { r: 0.003, segs: 2 });
  const fw = lw - 2 * st, cx = lw / 2;
  const fixed = spec.rows.reduce((a, r) => a + (r.rail ?? r.h ?? 0), 0);
  const wsum = spec.rows.reduce((a, r) => a + (r.rail == null && r.h == null ? (r.w ?? 1) : 0), 0) || 1;
  const free = Math.max(0.05, lh - fixed);
  let y = 0;
  for (const r of spec.rows) {
    if (r.rail != null) { k.box('leaf', mat, fw, r.rail, lt, X(cx), y + r.rail / 2, zc, { r: 0.002 }); y += r.rail; continue; }
    const rh = r.h ?? ((r.w ?? 1) / wsum) * free;
    const n = r.cols ?? 1, mw = r.colMw ?? 0.09, cw = (fw - (n - 1) * mw) / n;
    for (let c = 0; c < n; c++) {
      if (c) k.box('leaf', mat, mw, rh, lt, X(st + c * (cw + mw) - mw / 2), y + rh / 2, zc, { r: 0.002 });
      field(k, r, { ...o, cx: st + cw * (c + 0.5) + mw * c, cy: y + rh / 2, fw: cw, fh: rh });
    }
    y += rh;
  }
}

/** Hinge barrels on the leaf's hinge edge. */
function barrels(k, X, lh, z, mat, n = 3) {
  const ys = n === 2 ? [0.25, lh - 0.25] : [0.22, lh / 2 + 0.1, lh - 0.25];
  for (const hy of ys) if (hy < lh) k.cyl('hardware', mat, 0.008, 0.008, 0.1, X(-0.004), hy - 0.05, z, { segs: k.seg(12, 6) });
}

/** Runs fn(zc) with the parts placed on a leaf hinged at (hx, y0, zFace) and opened by angle. */
function swing(k, { hx, dir, zFace, angle, lt, side = 1, y0 = 0.008, zc }, fn) {
  const m = pivot(0, 0, 0, { ry: -dir * side * angle });
  m.premultiply(M4(hx, y0, zFace));
  withMatrix(k, m, () => fn(zc ?? -side * lt / 2));
}

/* ----------------------------------------------------- hinged door factory */

export const HANDLE_OPTS = [['lever', '레버', 'Lever'], ['knob', '원형 손잡이', 'Knob'], ['pull', '바 손잡이', 'Bar pull'], ['none', '없음', 'None']];

/**
 * A hinged door (single or pair) in a cased frame. `leaf(k, o)` draws one leaf in leaf-local
 * coordinates (o: lw, lh, lt, X, dir, zc, p, mat) and may return { noHandle, handleY }.
 */
export function hingedDoor(def) {
  const {
    id, ko, en, tags, pair = false, w = pair ? 1.6 : 0.9, h = 2.1, wr = pair ? [1.0, 2.4] : [0.6, 1.4], hr = [1.8, 2.6],
    leafMat = 'wood-white', frameMat = 'wood-white', handle = 'lever', handleMat = 'metal-steel', lt = 0.04,
    threshold = false, frame = 'casing', side = 1, centred = false, stops = !centred, hingeDef = 'left', handles = true, extra = [],
  } = def;
  return item({
    id, ko, en, category: 'doors', placement: 'opening', tags,
    bboxSlack: frame === 'casing' ? DOOR_SLACK(0.2) : [0.04, 0.03, 0.06], anchor: { asymmetricZ: true },
    params: [
      P.len('width', '폭', 'Width', w, wr[0], wr[1]), P.len('height', '높이', 'Height', h, hr[0], hr[1]),
      ...(pair ? [] : [hingeParam(hingeDef)]), openParam(),
      P.mat('leafMat', '문짝', 'Leaf', leafMat), P.mat('frameMat', '문틀', 'Frame', frameMat),
      ...(handles ? [P.pick('handle', '손잡이', 'Handle', handle, HANDLE_OPTS)] : []),
      P.mat('handleMat', '손잡이 재질', 'Handle finish', handleMat, 'metal'),
      ...extra,
    ],
    build: (p, ctx) => {
      const k = new Kit(ctx);
      const t = wallT(ctx), W = p.width, H = p.height;
      doorFrame(k, W, H, t, p.frameMat, { threshold, casing: frame === 'casing' });
      if (def.frameExtra) def.frameExtra(k, p, { t, W, H });
      const zFace = centred ? lt / 2 : side * (t / 2 - 0.004);
      if (stops) doorStops(k, W, H, p.frameMat, zFace - side * (lt + 0.0175));
      const th = threshold ? 0.012 : 0;
      const lh = H - JAMB - GAP - 0.008 - th;
      const n = pair ? 2 : 1, lw = (W - 2 * JAMB - (n + 1) * GAP) / n;
      const dirs = pair ? [1, -1] : [p.hinge === 'right' ? -1 : 1];
      for (const dir of dirs) {
        swing(k, { hx: dir * -(W / 2 - JAMB - GAP), dir, zFace, side, angle: p.open * DEG, lt, y0: 0.008 + th }, (zc) => {
          const X = (x) => dir * x;
          const o = { lw, lh, lt, X, dir, zc, p, mat: p.leafMat, side };
          const r = def.leaf(k, o) ?? {};
          if (!r.noHinges) barrels(k, X, lh, zc + side * (lt / 2 - 0.004), p.handleMat);
          const style = handles ? p.handle : 'none';
          if (style !== 'none' && !r.noHandle) {
            for (const s of [-1, 1]) addLever(k, X(lw - (style === 'pull' ? 0.07 : 0.065)), r.handleY ?? 1.0, zc + s * lt / 2, s, -dir, style, p.handleMat, pair ? dir > 0 : true);
          }
        });
      }
      k.userData.swing = { hinge: pair ? 'both' : p.hinge, radius: lw, ...(side < 0 ? { side: 'exterior' } : {}), ...(centred ? { doubleActing: true } : {}) };
      return k.group();
    },
  });
}

export const spec = (s) => (k, o) => { specLeaf(k, s, o); };

/* --------------------------------------------------- panelled hinged doors */

const twoPanel = hingedDoor({
  id: 'door-two-panel', ko: '2판넬 문', en: '2-panel door', leafMat: 'paint-white-gloss', frameMat: 'paint-white-gloss',
  tags: ['door', '2 panel door', 'panel door', '문', '2판넬 문', '판넬 도어', '방문'],
  leaf: spec({ stile: 0.12, rows: [{ rail: 0.22 }, { type: 'raised', w: 1 }, { rail: 0.18 }, { type: 'raised', w: 1.35 }, { rail: 0.12 }] }),
});
const threePanel = hingedDoor({
  id: 'door-three-panel', ko: '3단 판넬 문', en: '3-panel door', leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-black',
  tags: ['door', '3 panel door', 'oak door', '문', '3판넬 문', '원목 문', '방문'],
  leaf: spec({ stile: 0.12, rows: [{ rail: 0.2 }, { type: 'raised' }, { rail: 0.12 }, { type: 'raised' }, { rail: 0.12 }, { type: 'raised' }, { rail: 0.12 }] }),
});
const sixPanel = hingedDoor({
  id: 'door-six-panel', ko: '6판넬 문(콜로니얼)', en: '6-panel colonial door', leafMat: 'paint-white-gloss', frameMat: 'paint-white-gloss', handle: 'knob', handleMat: 'metal-brass',
  tags: ['door', 'six panel door', 'colonial door', 'classic door', '문', '6판넬 문', '클래식 문', '방문'],
  leaf: spec({ stile: 0.12, rows: [{ rail: 0.2 }, { type: 'raised', w: 0.85, cols: 2 }, { rail: 0.18 }, { type: 'raised', w: 1.15, cols: 2 }, { rail: 0.1 }, { type: 'raised', w: 0.45, cols: 2 }, { rail: 0.12 }] }),
});
const shaker = hingedDoor({
  id: 'door-shaker', ko: '셰이커 문', en: 'Shaker door', leafMat: 'paint-green-matte', frameMat: 'paint-white-gloss', handle: 'knob', handleMat: 'metal-black',
  tags: ['door', 'shaker door', 'painted door', '문', '셰이커 문', '도장 문', '방문'],
  leaf: spec({ stile: 0.14, rows: [{ rail: 0.22 }, { type: 'flat', w: 1 }, { rail: 0.14 }, { type: 'flat', w: 1.4 }, { rail: 0.14 }] }),
});
const fivePanel = hingedDoor({
  id: 'door-five-panel', ko: '5단 가로판넬 문', en: '5-panel mission door', leafMat: 'wood-walnut', frameMat: 'wood-walnut', handleMat: 'metal-black',
  tags: ['door', 'five panel door', 'mission door', '문', '5판넬 문', '가로 판넬 문', '월넛 문'],
  leaf: spec({ stile: 0.12, rows: [{ rail: 0.18 }, { type: 'flat' }, { rail: 0.07 }, { type: 'flat' }, { rail: 0.07 }, { type: 'flat' }, { rail: 0.07 }, { type: 'flat' }, { rail: 0.07 }, { type: 'flat' }, { rail: 0.14 }] }),
});
const flush = hingedDoor({
  id: 'door-flush', ko: '평판 도장 문(플러시)', en: 'Flush door', leafMat: 'paint-white-matte', frameMat: 'paint-white-matte',
  tags: ['door', 'flush door', 'modern door', '문', '플러시 도어', '평판 문', '방문'],
  leaf: (k, { lw, lh, lt, X, zc, mat }) => {
    k.box('leaf', mat, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    // hardwood edge lipping on the lock and hinge edges
    for (const s of [0, 1]) k.box('leaf', mat, 0.008, lh - 0.004, lt + 0.001, X(s ? lw - 0.004 : 0.004), lh / 2, zc, { r: 0.002 });
  },
});
const inlay = hingedDoor({
  id: 'door-flush-inlay', ko: '라인 인레이 평판 문', en: 'Flush door with metal inlays', leafMat: 'paint-grey-matte', frameMat: 'paint-grey-matte', handle: 'pull', handleMat: 'metal-black',
  tags: ['door', 'flush door', 'inlay door', 'modern door', '문', '인레이 문', '라인 도어', '모던 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat }) => {
    k.box('leaf', mat, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    for (const s of [-1, 1]) for (const fy of [0.2, 0.4, 0.6, 0.8]) k.box('inlay', 'metal-aluminium', lw - 0.12, 0.006, 0.002, X(lw / 2), lh * fy, zc + s * (lt / 2 + 0.0006), { r: 0 });
  },
});
const halfGlass = hingedDoor({
  id: 'door-half-glass', ko: '반유리 판넬 문', en: 'Half-glass panel door', leafMat: 'wood-white', frameMat: 'wood-white', handleMat: 'metal-brass',
  tags: ['door', 'half glass door', 'glazed door', '문', '반유리 문', '유리 판넬 문', '거실 문'],
  leaf: spec({ stile: 0.12, rows: [{ rail: 0.22 }, { type: 'raised', w: 0.9, cols: 2 }, { rail: 0.18 }, { type: 'glass', w: 1.0, grid: [2, 3] }, { rail: 0.12 }] }),
});
const gridGlass = hingedDoor({
  id: 'door-glazed-grid', ko: '격자 유리 문', en: 'Glazed door with grid', leafMat: 'paint-black-matte', frameMat: 'paint-black-matte', handleMat: 'metal-brass', lt: 0.045,
  tags: ['door', 'glass door', 'french door', 'grid door', '문', '격자 유리문', '프렌치 도어', '유리 중문'],
  leaf: spec({ stile: 0.1, rows: [{ rail: 0.2 }, { type: 'glass', grid: [3, 5] }, { rail: 0.1 }] }),
});
const frostStrip = hingedDoor({
  id: 'door-frosted-strip', ko: '간살 불투명 유리 문(욕실)', en: 'Bathroom door with frosted lites', leafMat: 'wood-ash', frameMat: 'wood-ash', handleMat: 'metal-chrome',
  tags: ['door', 'bathroom door', 'frosted glass door', '문', '욕실 문', '화장실 문', '불투명 유리'],
  leaf: spec({ stile: 0.32, rows: [{ rail: 0.32 }, { type: 'frost' }, { rail: 0.07 }, { type: 'frost' }, { rail: 0.07 }, { type: 'frost' }, { rail: 0.07 }, { type: 'frost' }, { rail: 0.3 }] }),
});
const louvre = hingedDoor({
  id: 'door-louvre', ko: '루버 문', en: 'Louvred door', leafMat: 'wood-white', frameMat: 'wood-white', handle: 'knob', handleMat: 'metal-brass',
  tags: ['door', 'louvre door', 'louvered door', 'utility door', '문', '루버 문', '통풍 문', '다용도실 문'],
  leaf: spec({ stile: 0.1, rows: [{ rail: 0.16 }, { type: 'louvre' }, { rail: 0.14 }, { type: 'louvre', w: 1.2 }, { rail: 0.1 }] }),
});
const steelGlass = hingedDoor({
  id: 'door-steel-glass', ko: '철제 격자 유리 문', en: 'Steel-framed glass door', leafMat: 'metal-black', frameMat: 'metal-black', handleMat: 'metal-black', lt: 0.045, frame: 'plain',
  tags: ['door', 'steel door', 'crittall door', 'industrial door', 'glass door', '문', '철제 유리문', '스틸 도어', '인더스트리얼'],
  leaf: spec({ stile: 0.05, rows: [{ rail: 0.12 }, { type: 'glass', grid: [2, 5], mw: 0.018 }, { rail: 0.05 }] }),
});

const hanok = hingedDoor({
  id: 'door-hanok', ko: '한옥 띠살 여닫이문', en: 'Korean hanok lattice door', pair: true, w: 1.5, h: 2.0, leafMat: 'wood-dark', frameMat: 'wood-dark', handleMat: 'metal-black', side: -1, handles: false, lt: 0.042,
  tags: ['door', 'hanok door', 'korean door', 'lattice door', '문', '한옥 문', '띠살문', '창호지', '전통 문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat, p } = o;
    specLeaf(k, { stile: 0.055, rows: [{ rail: 0.07 }, { type: 'flat', h: 0.28 }, { rail: 0.05 }, { type: 'lattice', pattern: 'ddisal', w: 1 }, { rail: 0.06 }] }, o);
    // iron ring pull (문고리) on its plate, both faces
    for (const s of [-1, 1]) {
      const z = zc + s * (lt / 2 + 0.003);
      k.cyl('hardware', p.handleMat, 0.03, 0.03, 0.004, X(lw - 0.06), lh * 0.47, z - (s < 0 ? 0.004 : 0), { rx: Math.PI / 2, segs: k.seg(16, 6) });
      const cx = X(lw - 0.06), cy = lh * 0.47 - 0.045;
      const pts = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [cx + 0.035 * Math.cos(a), cy + 0.035 * Math.sin(a), z + s * 0.006]; });
      k.tube('hardware', p.handleMat, pts, 0.004, { closed: true, radial: k.seg(8, 4), segs: k.seg(24, 10) });
    }
    return { noHandle: true };
  },
});

const ledged = hingedDoor({
  id: 'door-ledged', ko: '띠장 판재 문(코티지)', en: 'Ledged and braced cottage door', leafMat: 'wood-pine', frameMat: 'wood-pine', handleMat: 'metal-black', lt: 0.05, handles: false,
  tags: ['door', 'ledged door', 'plank door', 'cottage door', 'rustic door', '문', '판재 문', '시골풍 문', '원목 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat, p, side }) => {
    // vertical tongue-and-groove boards (exterior half) + three ledges and two braces on the room side
    const n = Math.max(4, Math.round(lw / 0.13)), bw = lw / n, bt = lt * 0.5;
    const zb = zc - side * (lt / 2 - bt / 2), zl = zc + side * (lt / 2 - bt / 2);
    for (let i = 0; i < n; i++) k.box('leaf', mat, bw - 0.004, lh, bt, X(bw * (i + 0.5)), lh / 2, zb, { r: 0.003, segs: 2 });
    const ys = [0.2, lh / 2, lh - 0.2];
    for (const y of ys) k.box('leaf', mat, lw - 0.08, 0.14, bt, X(lw / 2), y, zl, { r: 0.004, segs: 2 });
    for (let i = 0; i < 2; i++) {
      const y0 = ys[i] + 0.07, y1 = ys[i + 1] - 0.07, x0 = 0.1, x1 = lw - 0.1;
      const L = Math.hypot(x1 - x0, y1 - y0);
      k.box('leaf', mat, 0.12, L, bt * 0.96, X((x0 + x1) / 2), (y0 + y1) / 2, zl, { r: 0.004, rz: -Math.atan2(X(x1 - x0), y1 - y0) });
    }
    // T-hinges on the ledges and a thumb latch
    const zh = zc + side * (lt / 2 + 0.002);
    for (const y of [ys[0], ys[2]]) {
      k.box('hardware', p.handleMat, 0.42, 0.035, 0.004, X(0.21), y, zh, { r: 0.0015 });
      k.box('hardware', p.handleMat, 0.03, 0.14, 0.004, X(-0.01), y, zh, { r: 0.0015 });
    }
    const hx = X(lw - 0.09);
    for (const s of [-1, 1]) k.box('hardware', p.handleMat, 0.03, 0.2, 0.004, hx, 1.0, zc + s * (lt / 2 + 0.002), { r: 0.0015 });
    k.rod('hardware', p.handleMat, [hx, 1.05, zc - side * (lt / 2 + 0.002)], [hx, 1.05, zc - side * (lt / 2 + 0.05)], 0.006);
    k.rod('hardware', p.handleMat, [hx, 0.93, zc - side * (lt / 2 + 0.002)], [hx, 0.93, zc - side * (lt / 2 + 0.05)], 0.006);
    k.rod('hardware', p.handleMat, [hx, 0.92, zc - side * (lt / 2 + 0.05)], [hx, 1.06, zc - side * (lt / 2 + 0.05)], 0.008);
    k.box('hardware', p.handleMat, 0.16, 0.012, 0.006, X(lw - 0.1), 1.08, zc + side * (lt / 2 + 0.004), { r: 0.002 });
    return { noHinges: true };
  },
});

const porthole = hingedDoor({
  id: 'door-porthole', ko: '원형창 스윙 문(주방)', en: 'Swing door with porthole', leafMat: 'paint-white-matte', frameMat: 'paint-white-matte', handleMat: 'metal-steel', lt: 0.045, handles: false, centred: true,
  tags: ['door', 'swing door', 'kitchen door', 'porthole door', 'cafe door', '문', '스윙 도어', '주방 문', '원형 창 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat, p }) => {
    const r = Math.min(0.16, lw * 0.25), cy = Math.min(1.5, lh - 0.3);
    const s = new THREE.Shape([V2(X(0), 0), V2(X(lw), 0), V2(X(lw), lh), V2(X(0), lh)]);
    const hole = new THREE.Path(); hole.absarc(X(lw / 2), cy, r, 0, Math.PI * 2, true); s.holes.push(hole);
    k.panel('leaf', mat, s, lt, 0, 0, zc, { bevel: 0.003, curveSegs: 32 });
    k.cyl('glass', 'glass-clear', r + 0.008, r + 0.008, 0.008, X(lw / 2), cy, zc - 0.004, { rx: Math.PI / 2, segs: k.seg(32, 12) });
    for (const sd of [-1, 1]) {
      k.panel('trim', p.handleMat, circleShape(r + 0.035, 0, 0, r - 0.004), 0.008, X(lw / 2), cy, zc + sd * (lt / 2 + 0.004), { bevel: 0.002, curveSegs: 32 });
      k.box('trim', p.handleMat, lw - 0.06, 0.25, 0.002, X(lw / 2), 0.15, zc + sd * (lt / 2 + 0.001), { r: 0 });
      k.box('trim', p.handleMat, 0.1, 0.32, 0.002, X(lw - 0.12), 1.1, zc + sd * (lt / 2 + 0.001), { r: 0 });
    }
    return { noHandle: true };
  },
});

/* ------------------------------------------------------------ custom doors */

export const doorCommon = (w, h, wr = [0.6, 1.4], hr = [1.8, 2.6]) => [P.len('width', '폭', 'Width', w, wr[0], wr[1]), P.len('height', '높이', 'Height', h, hr[0], hr[1])];

const arched = item({
  id: 'door-arched', category: 'doors', placement: 'opening', ko: '아치형 원목 문', en: 'Arched-top door',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(0.95, 2.25, [0.7, 1.4], [1.95, 2.8]), P.len('rise', '아치 높이', 'Arch rise', 0.3, 0.1, 0.6), hingeParam(), openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-dark'), P.mat('frameMat', '문틀', 'Frame', 'wood-dark'), P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal')],
  tags: ['door', 'arched door', 'arch door', 'mediterranean door', '문', '아치형 문', '아치 문', '원목 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.045, n = k.seg(32, 10);
    const wi = W - 2 * JAMB, rise = clamp(p.rise, 0.05, Math.min(wi / 2, H - 1.9));
    const c = archCircle(wi, H - rise, rise);
    for (const s of [-1, 1]) k.box('frame', p.frameMat, JAMB, H, t, s * (W / 2 - JAMB / 2), H / 2, 0, { r: 0.002 });
    k.panel('frame', p.frameMat, spandrelShape(wi, c, H, n), t, 0, 0, 0, { bevel: 0.002 });
    for (const side of [1, -1]) k.panel('casing', p.frameMat, archBand(wi, c, 0.1, 0, n), 0.016, 0, 0, side * (t / 2 + 0.008), { bevel: 0.004 });
    const zFace = t / 2 - 0.004, ys = H - rise;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.012, ys - 0.01, 0.035, s * (W / 2 - JAMB - 0.006), (ys - 0.01) / 2, zFace - lt - 0.0175, { r: 0.002 });
    const dir = p.hinge === 'right' ? -1 : 1, lw = wi - 2 * GAP, y0 = 0.008;
    swing(k, { hx: dir * -(W / 2 - JAMB - GAP), dir, zFace, angle: p.open * DEG, lt, y0 }, (zc) => {
      const X = (x) => dir * x;
      const cl = { cx: X(lw / 2), cy: c.cy - y0, R: c.R - GAP };
      const lys = cl.cy + Math.sqrt(Math.max(0, cl.R ** 2 - (lw / 2) ** 2));
      // leaf with an arched lite: the lite follows a concentric arc 0.13 m inside
      const outline = [V2(X(0), 0), V2(X(lw), 0), ...arcPts(cl.cx, cl.cy, cl.R, X(lw), X(0), n)];
      const s = new THREE.Shape(outline);
      const li = 0.14, lw2 = lw - 2 * li, ly0 = Math.max(0.9, lys - 0.5);
      const Rl = cl.R - li;
      const lite = [V2(cl.cx - lw2 / 2, ly0), V2(cl.cx + lw2 / 2, ly0), ...arcPts(cl.cx, cl.cy, Rl, cl.cx + lw2 / 2, cl.cx - lw2 / 2, n)];
      s.holes.push(new THREE.Path(lite.slice().reverse()));
      k.panel('leaf', p.leafMat, s, lt, 0, 0, zc, { bevel: 0.003 });
      const gl = [V2(cl.cx - lw2 / 2 - 0.006, ly0 - 0.006), V2(cl.cx + lw2 / 2 + 0.006, ly0 - 0.006), ...arcPts(cl.cx, cl.cy, Rl + 0.006, cl.cx + lw2 / 2 + 0.006, cl.cx - lw2 / 2 - 0.006, n)];
      k.panel('glass', 'glass-clear', new THREE.Shape(gl), 0.008, 0, 0, zc, { bevel: 0 });
      // a cross bar in the lite, two raised panels below
      k.box('leaf', p.leafMat, 0.025, cl.cy + Rl - ly0, lt * 0.6, cl.cx, (ly0 + cl.cy + Rl) / 2, zc, { r: 0.003 });
      const ph = ly0 - 0.15 - 0.2, pw = (lw - 2 * 0.12 - 0.08) / 2;
      for (const e of [-1, 1]) k.rbox('leaf', p.leafMat, pw, ph, lt + 0.012, 0.008, cl.cx + e * (pw / 2 + 0.04), 0.2 + ph / 2, zc, { segs: k.seg(3, 1) });
      // clavos (studs) and strap hinges
      for (const e of [-1, 1]) for (const fy of [0.25, 0.75]) k.sphere('hardware', p.handleMat, 0.008, cl.cx + e * (pw / 2 + 0.04), 0.2 + ph * fy, zc + lt / 2 + 0.006, { segs: k.seg(8, 4), rings: k.seg(6, 3) });
      for (const y of [0.3, ly0 + 0.05]) k.box('hardware', p.handleMat, 0.36, 0.04, 0.004, X(0.18), y, zc + lt / 2 + 0.002, { r: 0.0015 });
      for (const sd of [-1, 1]) addLever(k, X(lw - 0.07), 1.0, zc + sd * lt / 2, sd, -dir, 'lever', p.handleMat, true);
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const archedOpening = item({
  id: 'door-arched-opening', category: 'doors', placement: 'opening', ko: '아치 개구부(문 없음)', en: 'Arched cased opening',
  bboxSlack: DOOR_SLACK(0.2),
  params: [...doorCommon(1.2, 2.3, [0.7, 2.6], [1.9, 2.9]), P.len('rise', '아치 높이', 'Arch rise', 0.45, 0.1, 1.2),
    P.mat('frameMat', '몰딩', 'Casing', 'wood-white'), P.mat('lining', '벽면 마감', 'Reveal finish', 'paint-white-matte')],
  tags: ['opening', 'arched opening', 'arch', 'archway', 'door', '아치', '아치 개구부', '아치형 입구', '문 없음'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, n = k.seg(40, 12);
    const wi = W - 0.024, rise = clamp(p.rise, 0.05, Math.min(wi / 2, H - 1.6));
    const c = archCircle(wi, H - rise, rise);
    for (const s of [-1, 1]) k.box('lining', p.lining, 0.012, H, t, s * (W / 2 - 0.006), H / 2, 0, { r: 0 });
    k.panel('lining', p.lining, spandrelShape(wi, c, H, n), t, 0, 0, 0, { bevel: 0 });
    for (const side of [1, -1]) {
      k.panel('casing', p.frameMat, archBand(wi, c, 0.08, 0, n), 0.016, 0, 0, side * (t / 2 + 0.008), { bevel: 0.004 });
      // plinth blocks at the foot of the casing
      for (const s of [-1, 1]) k.box('casing', p.frameMat, 0.1, 0.2, 0.024, s * (wi / 2 + 0.04), 0.1, side * (t / 2 + 0.012), { r: 0.004, segs: 2 });
    }
    k.userData.swing = { hinge: 'none', radius: 0 };
    return k.group();
  },
});

const casedOpening = item({
  id: 'door-cased-opening', category: 'doors', placement: 'opening', ko: '몰딩 개구부(문 없음)', en: 'Cased opening',
  bboxSlack: DOOR_SLACK(0.2),
  params: [...doorCommon(1.2, 2.1, [0.6, 3.0], [1.8, 2.8]), P.mat('frameMat', '몰딩', 'Casing', 'wood-white'), P.bool('plinths', '받침 블록', 'Plinth blocks', true)],
  tags: ['opening', 'cased opening', 'doorway', 'door', '개구부', '문 없음', '몰딩 입구', '통로'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height;
    doorFrame(k, W, H, t, p.frameMat);
    if (p.plinths) for (const side of [1, -1]) for (const s of [-1, 1]) k.box('casing', p.frameMat, 0.085, 0.2, 0.026, s * (W / 2 - 0.012 + 0.035), 0.1, side * (t / 2 + 0.013), { r: 0.004, segs: 2 });
    k.userData.swing = { hinge: 'none', radius: 0 };
    return k.group();
  },
});

const dutch = item({
  id: 'door-dutch', category: 'doors', placement: 'opening', ko: '상하 분리문(더치 도어)', en: 'Dutch stable door',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(0.9, 2.1), hingeParam(), openParam(), P.num('openTop', '윗문 열림(°)', 'Top leaf open (°)', 35, 0, 90, 1),
    P.mat('leafMat', '문짝', 'Leaf', 'paint-blue-matte'), P.mat('frameMat', '문틀', 'Frame', 'paint-white-gloss'), P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal')],
  tags: ['door', 'dutch door', 'stable door', 'split door', '문', '더치 도어', '상하 분리문', '마구간 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.045;
    doorFrame(k, W, H, t, p.frameMat);
    const zFace = t / 2 - 0.004;
    doorStops(k, W, H, p.frameMat, zFace - lt - 0.0175);
    const lh = H - JAMB - GAP - 0.008, lw = W - 2 * JAMB - 2 * GAP;
    const split = clamp(1.05, 0.8, lh - 0.6);
    const dir = p.hinge === 'right' ? -1 : 1, X = (x) => dir * x, hx = dir * -(W / 2 - JAMB - GAP);
    swing(k, { hx, dir, zFace, angle: p.open * DEG, lt }, (zc) => {
      const o = { lw, lh: split, lt, X, zc, mat: p.leafMat };
      specLeaf(k, { stile: 0.12, rows: [{ rail: 0.2 }, { type: 'raised' }, { rail: 0.12 }] }, o);
      // serving shelf on the lower leaf
      k.box('leaf', p.leafMat, lw, 0.028, 0.13, X(lw / 2), split + 0.014, zc + lt / 2 + 0.065 - lt / 2 - 0.02, { r: 0.004, segs: 2 });
      barrels(k, X, split, zc + lt / 2 - 0.004, p.handleMat, 2);
      for (const s of [-1, 1]) addLever(k, X(lw - 0.065), split - 0.2, zc + s * lt / 2, s, -dir, 'knob', p.handleMat, false);
    });
    swing(k, { hx, dir, zFace, angle: Math.max(p.open, p.openTop) * DEG, lt, y0: 0.008 + split + 0.03 }, (zc) => {
      const uh = lh - split - 0.03;
      specLeaf(k, { stile: 0.12, rows: [{ rail: 0.12 }, { type: 'glass', grid: [2, 2] }, { rail: 0.12 }] }, { lw, lh: uh, lt, X, zc, mat: p.leafMat });
      for (const hy of [0.15, uh - 0.2]) k.cyl('hardware', p.handleMat, 0.008, 0.008, 0.1, X(-0.004), hy - 0.05, zc + lt / 2 - 0.004, { segs: k.seg(12, 6) });
      // slide bolt that ties the two leaves together
      k.rbox('hardware', p.handleMat, 0.025, 0.12, 0.012, 0.004, X(lw - 0.2), 0.1, zc + lt / 2 + 0.006, { segs: k.seg(2, 1) });
      for (const s of [-1, 1]) addLever(k, X(lw - 0.065), 0.25, zc + s * lt / 2, s, -dir, 'knob', p.handleMat, false);
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const cafe = item({
  id: 'door-cafe', category: 'doors', placement: 'opening', ko: '카페 스윙 도어(살롱 문)', en: 'Café saloon doors',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.0, 2.1, [0.7, 1.6], [1.8, 2.6]), openParam(), P.mat('leafMat', '문짝', 'Leaves', 'wood-oak'), P.mat('frameMat', '몰딩', 'Casing', 'wood-oak'), P.mat('handleMat', '경첩', 'Hinges', 'metal-brass', 'metal')],
  tags: ['door', 'cafe door', 'saloon door', 'swing door', 'bar door', '문', '카페 도어', '살롱 문', '스윙 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.03;
    doorFrame(k, W, H, t, p.frameMat);
    const lw = (W - 2 * JAMB - 3 * GAP) / 2, body = clamp(H * 0.42, 0.75, 1.0), crown = 0.2, y0 = clamp(H * 0.15, 0.28, 0.4);
    for (const dir of [1, -1]) {
      const m = pivot(0, 0, 0, { ry: -dir * p.open * DEG });
      m.premultiply(M4(dir * -(W / 2 - JAMB - GAP), y0, 0));
      withMatrix(k, m, () => {
        const X = (x) => dir * x, zc = 0;
        specLeaf(k, { stile: 0.07, rows: [{ rail: 0.1 }, { type: 'louvre' }, { rail: 0.08 }] }, { lw, lh: body, lt, X, zc, mat: p.leafMat });
        // scalloped crown rail: high at the hinge, low at the meeting edge
        const pts = [V2(X(0), body - 0.005), V2(X(lw), body - 0.005), V2(X(lw), body + 0.04)];
        for (let i = 1; i < 12; i++) { const u = 1 - i / 12; pts.push(V2(X(lw * u), body + 0.04 + (crown - 0.04) * Math.sin((1 - u) * Math.PI / 2) ** 1.6)); }
        pts.push(V2(X(0), body + crown));
        k.panel('leaf', p.leafMat, new THREE.Shape(pts), lt, 0, 0, zc, { bevel: 0.004 });
        // double-acting spring hinges
        for (const hy of [0.12, body + crown - 0.12]) k.cyl('hardware', p.handleMat, 0.012, 0.012, 0.12, X(-0.006), hy - 0.06, 0, { segs: k.seg(14, 6) });
      });
    }
    k.userData.swing = { hinge: 'both', radius: lw, doubleActing: true };
    return k.group();
  },
});

const frenchTransom = item({
  id: 'door-french-transom', category: 'doors', placement: 'opening', ko: '채광창 프렌치 도어', en: 'French doors with transom',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.6, 2.7, [1.1, 2.4], [2.3, 3.2]), P.len('transom', '채광창 높이', 'Transom height', 0.45, 0.25, 0.8), openParam(),
    P.mat('leafMat', '문짝', 'Leaves', 'paint-white-gloss'), P.mat('frameMat', '문틀', 'Frame', 'paint-white-gloss'), P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-brass', 'metal')],
  tags: ['door', 'french door', 'transom', 'glass door', 'patio door', '문', '프렌치 도어', '채광창', '양개 유리문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.045;
    doorFrame(k, W, H, t, p.frameMat, { threshold: true });
    const hd = clamp(H - JAMB - p.transom - 0.06, 1.8, H - 0.3);
    const zFace = t / 2 - 0.004;
    doorStops(k, W, hd + JAMB, p.frameMat, zFace - lt - 0.0175);
    k.box('frame', p.frameMat, W - 2 * JAMB, 0.06, t, 0, hd + 0.03, 0, { r: 0.003 });
    // fixed transom sash with a 4-lite grid
    const th = H - JAMB - hd - 0.06;
    ring(k, 'leaf', p.leafMat, W - 2 * JAMB, th, 0.05, 0.05, 0, hd + 0.06 + th / 2, 0);
    k.box('glass', 'glass-clear', W - 2 * JAMB - 0.09, th - 0.09, 0.008, 0, hd + 0.06 + th / 2, 0, { r: 0 });
    for (let i = 1; i < 4; i++) k.box('leaf', p.leafMat, 0.022, th - 0.1, 0.03, -(W - 2 * JAMB) / 2 + ((W - 2 * JAMB) * i) / 4, hd + 0.06 + th / 2, 0, { r: 0.003 });
    const lw = (W - 2 * JAMB - 3 * GAP) / 2, lh = hd - GAP - 0.02;
    for (const dir of [1, -1]) {
      swing(k, { hx: dir * -(W / 2 - JAMB - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.02 }, (zc) => {
        const X = (x) => dir * x;
        specLeaf(k, { stile: 0.1, rows: [{ rail: 0.2 }, { type: 'glass', grid: [2, 5] }, { rail: 0.1 }] }, { lw, lh, lt, X, zc, mat: p.leafMat });
        barrels(k, X, lh, zc + lt / 2 - 0.004, p.handleMat);
        for (const s of [-1, 1]) addLever(k, X(lw - 0.06), 1.0, zc + s * lt / 2, s, -dir, 'lever', p.handleMat, dir > 0);
      });
    }
    k.userData.swing = { hinge: 'both', radius: lw };
    return k.group();
  },
});

const fanlight = item({
  id: 'door-fanlight', category: 'doors', placement: 'opening', ko: '반원 채광창 현관문', en: 'Front door with fanlight',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.0, 2.65, [0.8, 1.4], [2.3, 3.2]), hingeParam(), openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'paint-blue-matte'), P.mat('frameMat', '문틀', 'Frame', 'paint-white-gloss'), P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-brass', 'metal')],
  tags: ['door', 'front door', 'fanlight', 'georgian door', 'entrance', '문', '현관문', '반원 채광창', '조지안 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.05, n = k.seg(32, 10);
    doorFrame(k, W, H, t, p.frameMat, { threshold: true });
    const wi = W - 2 * JAMB;
    const rise = clamp(Math.min(wi / 2, H - JAMB - 0.06 - 1.9), 0.12, wi / 2);
    const ysp = H - JAMB - rise, hd = ysp - 0.06;
    const c = archCircle(wi, ysp, rise);
    k.box('frame', p.frameMat, wi, 0.06, t, 0, hd + 0.03, 0, { r: 0.003 });
    k.panel('frame', p.frameMat, spandrelShape(wi, c, H - JAMB + 0.001, n), t * 0.6, 0, 0, 0, { bevel: 0.002 });
    k.panel('frame', p.frameMat, arcRing(c, 0.045, ysp, n), 0.05, 0, 0, 0, { bevel: 0.003 });
    k.panel('glass', 'glass-clear', archedShape(wi - 0.02, ysp - 0.005, { ...c, R: c.R - 0.01 }, n), 0.008, 0, 0, 0, { bevel: 0 });
    // sunburst glazing bars from the hub to the sash ring, and the half-round hub
    const Ri = c.R - 0.04, dy = ysp - c.cy;
    for (const a of [30, 60, 90, 120, 150]) {
      const ang = a * DEG, b = dy * Math.sin(ang);
      const u1 = -b + Math.sqrt(Math.max(0, b * b - (dy * dy - Ri * Ri))), L = u1 - 0.07;
      if (L < 0.03) continue;
      k.box('frame', p.frameMat, 0.018, L, 0.03, Math.cos(ang) * (0.07 + L / 2), ysp + Math.sin(ang) * (0.07 + L / 2), 0, { r: 0.003, rz: ang - Math.PI / 2 });
    }
    const hub = new THREE.Shape(); hub.absarc(0, ysp, 0.075, 0, Math.PI, false); hub.lineTo(0.075, ysp);
    k.panel('frame', p.frameMat, hub, 0.035, 0, 0, 0, { bevel: 0.003 });
    const zFace = t / 2 - 0.004;
    doorStops(k, W, hd + JAMB, p.frameMat, zFace - lt - 0.0175);
    const lw = wi - 2 * GAP, lh = hd - GAP - 0.02, dir = p.hinge === 'right' ? -1 : 1;
    swing(k, { hx: dir * -(W / 2 - JAMB - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.02 }, (zc) => {
      const X = (x) => dir * x;
      specLeaf(k, { stile: 0.13, rows: [{ rail: 0.22 }, { type: 'raised', w: 0.85, cols: 2 }, { rail: 0.2 }, { type: 'raised', w: 1.15, cols: 2 }, { rail: 0.1 }, { type: 'raised', w: 0.45, cols: 2 }, { rail: 0.13 }] }, { lw, lh, lt, X, zc, mat: p.leafMat });
      barrels(k, X, lh, zc + lt / 2 - 0.004, p.handleMat);
      for (const s of [-1, 1]) addLever(k, X(lw - 0.07), 1.0, zc + s * lt / 2, s, -dir, 'knob', p.handleMat, true);
      // knocker ring and letter plate on the street face
      const ze = zc - lt / 2;
      k.cyl('hardware', p.handleMat, 0.03, 0.03, 0.012, X(lw / 2), 1.5, ze - 0.012, { rx: Math.PI / 2, segs: k.seg(16, 6) });
      const pts = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [X(lw / 2) + 0.06 * Math.cos(a), 1.44 + 0.06 * Math.sin(a), ze - 0.016]; });
      k.tube('hardware', p.handleMat, pts, 0.008, { closed: true, radial: k.seg(8, 4), segs: k.seg(28, 10) });
      k.rbox('hardware', p.handleMat, 0.3, 0.07, 0.008, 0.003, X(lw / 2), 0.75, ze - 0.004, { segs: k.seg(2, 1) });
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const sidelights = item({
  id: 'door-sidelights', category: 'doors', placement: 'opening', ko: '양쪽 유리 현관문(사이드라이트)', en: 'Front door with sidelights',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.85, 2.2, [1.4, 2.8], [1.9, 2.7]), hingeParam(), openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-teak'), P.mat('frameMat', '문틀', 'Frame', 'paint-white-gloss'), P.mat('glassMat', '유리', 'Glass', 'glass-frosted', 'glass'), P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal')],
  tags: ['door', 'front door', 'sidelights', 'entrance', 'entry door', '문', '현관문', '사이드라이트', '양쪽 유리 현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.05, mw = 0.06;
    doorFrame(k, W, H, t, p.frameMat, { threshold: true });
    const sl = clamp((W - 2 * JAMB - 2 * mw - 1.0) / 2, 0.18, 0.6);
    const dw = W - 2 * JAMB - 2 * sl - 2 * mw;
    const zFace = t / 2 - 0.004, lh = H - JAMB - GAP - 0.02;
    for (const s of [-1, 1]) {
      k.box('frame', p.frameMat, mw, H - JAMB, t, s * (dw / 2 + mw / 2), (H - JAMB) / 2, 0, { r: 0.003 });
      // stops around the door opening
      k.box('frame', p.frameMat, 0.012, H - JAMB, 0.035, s * (dw / 2 - 0.006), (H - JAMB) / 2, zFace - lt - 0.0175, { r: 0.002 });
      // the fixed sidelight: kick panel + glass
      const xs = s * (dw / 2 + mw + sl / 2);
      withMatrix(k, M4(0, 0.012, 0), () => specLeaf(k, { stile: 0.06, rows: [{ rail: 0.1 }, { type: 'raised', h: 0.42 }, { rail: 0.08 }, { type: 'glass', glass: p.glassMat, grid: [1, 3] }, { rail: 0.08 }] }, { lw: sl, lh: H - JAMB - 0.012, lt, X: (x) => xs - sl / 2 + x, zc: 0, mat: p.leafMat, glass: p.glassMat }));
    }
    k.box('frame', p.frameMat, dw, 0.012, 0.035, 0, H - JAMB - 0.006, zFace - lt - 0.0175, { r: 0.002 });
    const lw = dw - 2 * GAP, dir = p.hinge === 'right' ? -1 : 1;
    swing(k, { hx: dir * -(dw / 2 - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.02 }, (zc) => {
      const X = (x) => dir * x;
      specLeaf(k, { stile: 0.13, rows: [{ rail: 0.22 }, { type: 'raised', w: 1.6, cols: 2 }, { rail: 0.2 }, { type: 'glass', glass: p.glassMat, w: 0.45, cols: 3, colMw: 0.05 }, { rail: 0.14 }] }, { lw, lh: lh - 0.012, lt, X, zc, mat: p.leafMat, glass: p.glassMat });
      barrels(k, X, lh, zc + lt / 2 - 0.004, p.handleMat);
      for (const s of [-1, 1]) addLever(k, X(lw - 0.07), 1.0, zc + s * lt / 2, s, -dir, 'pull', p.handleMat);
      for (const s of [-1, 1]) k.cyl('hardware', p.handleMat, 0.02, 0.02, 0.008, X(lw - 0.07), 1.35, zc + s * (lt / 2), { rx: s * Math.PI / 2, segs: k.seg(16, 6) });
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const fireDoor = item({
  id: 'door-fire', category: 'doors', placement: 'opening', ko: '방화문(비전 창)', en: 'Fire door with vision panel',
  bboxSlack: [0.12, 0.06, 0.12], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.0, 2.1, [0.8, 1.3], [1.9, 2.5]), hingeParam(), openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'paint-grey-matte'), P.mat('frameMat', '문틀', 'Frame', 'paint-grey-matte'), P.bool('panic', '패닉바', 'Push bar', true)],
  tags: ['door', 'fire door', 'steel door', 'emergency exit', 'vision panel', '문', '방화문', '비상구', '철문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.055, fj = 0.05;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fj, H, t, s * (W / 2 - fj / 2), H / 2, 0, { r: 0.002 });
    k.box('frame', p.frameMat, W - 2 * fj, fj, t, 0, H - fj / 2, 0, { r: 0.002 });
    for (const side of [-1, 1]) {
      const z = side * (t / 2 + 0.005);
      for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.05, H + 0.04, 0.01, s * (W / 2 + 0.015), (H + 0.04) / 2, z, { r: 0.002 });
      k.box('frame', p.frameMat, W + 0.08, 0.05, 0.01, 0, H + 0.015, z, { r: 0.002 });
    }
    const zFace = t / 2 - 0.006;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.015, H - fj, 0.03, s * (W / 2 - fj - 0.0075), (H - fj) / 2, zFace - lt - 0.015, { r: 0.002 });
    const dir = p.hinge === 'right' ? -1 : 1, lw = W - 2 * fj - 2 * GAP, lh = H - fj - GAP - 0.012;
    swing(k, { hx: dir * -(W / 2 - fj - GAP), dir, zFace, angle: p.open * DEG, lt, y0: 0.01 }, (zc) => {
      const X = (x) => dir * x;
      // leaf around a narrow vision panel near the lock edge
      const vx0 = lw - 0.36, vx1 = lw - 0.2, vy0 = 1.15, vy1 = Math.min(1.85, lh - 0.15);
      k.box('leaf', p.leafMat, lw, vy0, lt, X(lw / 2), vy0 / 2, zc, { r: 0.003, segs: 2 });
      k.box('leaf', p.leafMat, lw, lh - vy1, lt, X(lw / 2), (vy1 + lh) / 2, zc, { r: 0.003, segs: 2 });
      k.box('leaf', p.leafMat, vx0, vy1 - vy0, lt, X(vx0 / 2), (vy0 + vy1) / 2, zc, { r: 0.002 });
      k.box('leaf', p.leafMat, lw - vx1, vy1 - vy0, lt, X((vx1 + lw) / 2), (vy0 + vy1) / 2, zc, { r: 0.002 });
      k.box('glass', 'glass-clear', vx1 - vx0 + 0.01, vy1 - vy0 + 0.01, 0.01, X((vx0 + vx1) / 2), (vy0 + vy1) / 2, zc, { r: 0 });
      for (const s of [-1, 1]) ring(k, 'trim', 'metal-steel', vx1 - vx0 + 0.04, vy1 - vy0 + 0.04, 0.025, 0.006, X((vx0 + vx1) / 2), (vy0 + vy1) / 2, zc + s * (lt / 2 + 0.003));
      for (const hy of [0.25, lh / 2, lh - 0.25]) k.cyl('hardware', 'metal-steel', 0.01, 0.01, 0.12, X(-0.005), hy - 0.06, zc + lt / 2 - 0.005, { segs: k.seg(12, 6) });
      // pull side (room): lever + overhead closer; push side: panic bar, kick plate and a sign
      addLever(k, X(lw - 0.07), 1.0, zc + lt / 2, 1, -dir, 'lever', 'metal-steel', true);
      k.rbox('hardware', 'metal-aluminium', 0.3, 0.06, 0.06, 0.01, X(0.3), lh - 0.07, zc + lt / 2 + 0.03, { segs: k.seg(2, 1) });
      k.rbox('hardware', 'metal-aluminium', 0.32, 0.02, 0.02, 0.006, X(0.42), lh - 0.07, zc + lt / 2 + 0.07, { segs: k.seg(2, 1), rz: 0 });
      const zb = zc - lt / 2;
      if (p.panic) {
        k.rbox('hardware', 'metal-steel', lw - 0.2, 0.05, 0.05, 0.012, X(lw / 2 + 0.03), 1.0, zb - 0.06, { segs: k.seg(3, 1) });
        for (const e of [0.12, lw - 0.06]) k.rbox('hardware', 'metal-steel', 0.06, 0.1, 0.05, 0.01, X(e), 1.0, zb - 0.03, { segs: k.seg(2, 1) });
      } else addLever(k, X(lw - 0.07), 1.0, zb, -1, -dir, 'lever', 'metal-steel', false);
      k.box('trim', 'metal-steel', lw - 0.04, 0.25, 0.002, X(lw / 2), 0.15, zb - 0.001, { r: 0 });
      k.box('sign', 'plastic-white', 0.2, 0.1, 0.003, X(lw / 2 - 0.1), 1.55, zb - 0.0015, { r: 0 });
    });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

/* ------------------------------------------------- sliding / folding doors */

/** Barn-door top track + rollers; returns the leaf centre x and its z. */
function barnTrack(k, t, lw, lh, s, open, mat, lt) {
  const zl = t / 2 + 0.03 + lt / 2, ty = lh + 0.12, tl = 2 * lw + 0.1, tx = s * (lw / 2);
  k.box('track', mat, tl, 0.04, 0.008, tx, ty, t / 2 + 0.03, { r: 0.002 });
  for (let i = 0; i < 4; i++) k.cyl('track', mat, 0.012, 0.012, 0.03, tx - tl / 2 + 0.05 + (i * (tl - 0.1)) / 3, ty, t / 2, { rx: Math.PI / 2, segs: k.seg(12, 6) });
  for (const e of [-1, 1]) k.box('track', mat, 0.012, 0.05, 0.03, tx + e * (tl / 2 - 0.006), ty + 0.02, t / 2 + 0.042, { r: 0.002 });
  const x = s * clamp(open, 0, 1) * lw;
  for (const e of [-1, 1]) {
    const rx = x + e * (lw / 2 - 0.15);
    k.box('track', mat, 0.04, 0.24, 0.006, rx, ty - 0.03, zl + lt / 2 + 0.004, { r: 0.002 });
    k.cyl('track', mat, 0.04, 0.04, 0.02, rx, ty + 0.02, t / 2 + 0.045, { rx: Math.PI / 2, segs: k.seg(20, 8) });
  }
  return { x, zl };
}

function barnEntry({ id, ko, en, tags, leafMat, trackMat = 'metal-black', design }) {
  return item({
    id, ko, en, category: 'doors', placement: 'opening', tags,
    bboxSlack: [1.1, 0.25, 0.12], anchor: { asymmetricX: true, asymmetricZ: true },
    params: [...doorCommon(0.9, 2.1), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), P.pick('side', '열리는 쪽', 'Slides to', 'right', OPT.hinge),
      P.mat('leafMat', '문짝', 'Leaf', leafMat), P.mat('trackMat', '레일', 'Track', trackMat, 'metal')],
    build: (p, ctx) => {
      const k = new Kit(ctx);
      const t = wallT(ctx), W = p.width, H = p.height, lt = 0.04;
      doorFrame(k, W, H, t, 'wood-white', { casing: false });
      const s = p.side === 'left' ? -1 : 1, lw = W + 0.1, lh = H + 0.05;
      const { x, zl } = barnTrack(k, t, lw, lh, s, p.open, p.trackMat, lt);
      withMatrix(k, M4(0, 0.01, 0), () => design(k, { lw, lh, lt, X: (u) => x - lw / 2 + u, zc: zl, mat: p.leafMat, p }));
      k.rbox('hardware', p.trackMat, 0.03, 0.3, 0.03, 0.012, x - s * (lw / 2 - 0.08), 1.0, zl + lt / 2 + 0.035, { segs: k.seg(2, 1) });
      for (const e of [-1, 1]) k.rod('hardware', p.trackMat, [x - s * (lw / 2 - 0.08), 1.0 + e * 0.12, zl + lt / 2], [x - s * (lw / 2 - 0.08), 1.0 + e * 0.12, zl + lt / 2 + 0.035], 0.006);
      k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
      return k.group();
    },
  });
}

const barnX = barnEntry({
  id: 'door-barn-x', ko: 'X 브레이스 바니 도어', en: 'X-brace barn door', leafMat: 'paint-grey-matte',
  tags: ['barn door', 'sliding door', 'farmhouse door', 'x brace', '바니 도어', '슬라이딩 도어', '팜하우스 문'],
  design: (k, { lw, lh, lt, X, zc, mat }) => {
    const st = 0.12;
    // tongue-and-groove infill behind a frame with an X in each half
    const n = Math.max(4, Math.round((lw - 2 * st) / 0.12)), bw = (lw - 2 * st) / n;
    for (let i = 0; i < n; i++) k.box('leaf', mat, bw - 0.003, lh - 2 * st + 0.01, lt * 0.5, X(st + bw * (i + 0.5)), lh / 2, zc - lt * 0.2, { r: 0.002 });
    for (const s of [0, 1]) k.box('leaf', mat, st, lh, lt, X(s ? lw - st / 2 : st / 2), lh / 2, zc, { r: 0.004, segs: 2 });
    const ym = lh / 2, fw = lw - 2 * st;
    for (const y of [st / 2, ym, lh - st / 2]) k.box('leaf', mat, fw, st, lt, X(lw / 2), y, zc, { r: 0.003, segs: 2 });
    // an X in each bay; the second diagonal is a little thinner so the crossing does not z-fight
    for (const [yy0, yy1] of [[st, ym - st / 2], [ym + st / 2, lh - st]]) {
      const fh = yy1 - yy0, L = Math.hypot(fw, fh) - 0.05, a = Math.atan2(fh, fw);
      k.box('leaf', mat, L, 0.1, lt * 0.8, X(lw / 2), (yy0 + yy1) / 2, zc, { r: 0.003, rz: a });
      k.box('leaf', mat, L, 0.1, lt * 0.7, X(lw / 2), (yy0 + yy1) / 2, zc, { r: 0.003, rz: -a });
    }
  },
});
const barnGlass = barnEntry({
  id: 'door-barn-glass', ko: '철제 유리 바니 도어', en: 'Steel and glass barn door', leafMat: 'metal-black',
  tags: ['barn door', 'sliding door', 'glass door', 'steel door', '바니 도어', '유리 슬라이딩 도어', '철제 유리문'],
  design: (k, o) => specLeaf(k, { stile: 0.05, rows: [{ rail: 0.05 }, { type: 'glass', grid: [2, 4], mw: 0.02 }, { rail: 0.05 }] }, o),
});

const FACES = [['shaker', '셰이커', 'Shaker'], ['flat', '평판', 'Flat'], ['mirror', '거울', 'Mirror'], ['louvre', '루버', 'Louvre']];
const faceLeaf = (k, face, o) => {
  if (face === 'flat') { k.box('leaf', o.mat, o.lw, o.lh, o.lt, o.X(o.lw / 2), o.lh / 2, o.zc, { r: 0.003, segs: 2 }); return; }
  const rows = face === 'mirror' ? [{ rail: 0.05 }, { type: 'mirror' }, { rail: 0.05 }]
    : face === 'louvre' ? [{ rail: 0.12 }, { type: 'louvre' }, { rail: 0.1 }, { type: 'louvre' }, { rail: 0.08 }]
      : [{ rail: 0.14 }, { type: 'flat', w: 1 }, { rail: 0.1 }, { type: 'flat', w: 1.3 }, { rail: 0.1 }];
  specLeaf(k, { stile: face === 'mirror' ? 0.05 : 0.1, rows }, o);
};

const bypass = item({
  id: 'door-bypass', category: 'doors', placement: 'opening', ko: '붙박이장 미닫이문(2짝)', en: 'Bypass closet doors',
  bboxSlack: DOOR_SLACK(0.2),
  params: [...doorCommon(1.8, 2.1, [1.0, 3.2], [1.8, 2.6]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05), P.pick('face', '문짝 형태', 'Panel face', 'shaker', FACES),
    P.mat('leafMat', '문짝', 'Panels', 'paint-white-matte'), P.mat('frameMat', '문틀', 'Frame', 'paint-white-matte')],
  tags: ['closet door', 'sliding door', 'bypass door', 'wardrobe door', '붙박이장 문', '미닫이문', '슬라이딩 도어', '옷장 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.03;
    doorFrame(k, W, H, t, p.frameMat);
    const iw = W - 2 * JAMB;
    k.box('track', 'metal-aluminium', iw, 0.035, 0.09, 0, H - JAMB - 0.0175, 0, { r: 0.002 });
    k.box('track', 'metal-aluminium', 0.04, 0.02, 0.09, 0, 0.01, 0, { r: 0.002 });
    const pw = iw / 2 + 0.025, ph = H - JAMB - 0.035 - 0.012;
    const open = clamp(p.open, 0, 0.9) * (pw - 0.05);
    [[-1, -0.022, 0], [1, 0.022, open]].forEach(([s, z, off]) => {
      const xc = s * (iw / 2 - pw / 2) - off;
      withMatrix(k, M4(0, 0.01, 0), () => faceLeaf(k, p.face, { lw: pw, lh: ph, lt, X: (u) => xc - pw / 2 + u, zc: z, mat: p.leafMat }));
      for (const f of [-1, 1]) k.cyl('hardware', 'metal-steel', 0.02, 0.02, 0.004, xc - s * (pw / 2 - 0.05), 1.0, z + f * (lt / 2 + 0.002) - (f < 0 ? 0.004 : 0), { rx: Math.PI / 2, segs: k.seg(16, 6) });
    });
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

const shoji = item({
  id: 'door-shoji', category: 'doors', placement: 'opening', ko: '쇼지 미닫이문(일본식)', en: 'Shoji sliding doors',
  bboxSlack: [0.04, 0.03, 0.04],
  params: [...doorCommon(1.6, 2.0, [1.0, 3.2], [1.7, 2.5]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05), P.mat('leafMat', '살대', 'Lattice', 'wood-ash'), P.mat('frameMat', '문틀', 'Frame', 'wood-ash')],
  tags: ['shoji', 'japanese door', 'sliding door', 'paper door', '쇼지', '일본식 문', '미닫이문', '창호지 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.03, fb = 0.04;
    // head + sill track (two grooves) and jambs
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fb, H, t, s * (W / 2 - fb / 2), H / 2, 0, { r: 0.002 });
    k.box('frame', p.frameMat, W - 2 * fb, 0.06, t, 0, H - 0.03, 0, { r: 0.002 });
    k.box('frame', p.frameMat, W - 2 * fb, 0.02, t, 0, 0.01, 0, { r: 0.002 });
    for (const z of [-0.06, 0, 0.06]) k.box('frame', p.frameMat, W - 2 * fb, 0.008, 0.012, 0, 0.024, z, { r: 0.001 });
    const iw = W - 2 * fb, pw = iw / 2 + 0.02, ph = H - 0.06 - 0.02 - 0.006;
    const open = clamp(p.open, 0, 0.9) * (pw - 0.04);
    [[-1, -0.03, 0], [1, 0.03, open]].forEach(([s, z, off]) => {
      const xc = s * (iw / 2 - pw / 2) - off;
      withMatrix(k, M4(0, 0.022, 0), () => specLeaf(k, { stile: 0.035, rows: [{ rail: 0.035 }, { type: 'solid', h: 0.22 }, { rail: 0.03 }, { type: 'lattice', grid: [3, 7], bw: 0.014 }, { rail: 0.035 }] }, { lw: pw, lh: ph, lt, X: (u) => xc - pw / 2 + u, zc: z, mat: p.leafMat }));
      k.box('hardware', 'wood-dark', 0.03, 0.08, 0.003, xc - s * (pw / 2 - 0.08), 0.95, z + s * 0 + lt / 2 + 0.0015, { r: 0 });
    });
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

const pocketDouble = item({
  id: 'door-pocket-double', category: 'doors', placement: 'opening', ko: '양쪽 포켓 유리문', en: 'Double pocket doors',
  bboxSlack: DOOR_SLACK(0.2),
  params: [...doorCommon(1.6, 2.2, [1.1, 2.8], [1.9, 2.7]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05), P.mat('leafMat', '문짝', 'Leaves', 'wood-white'), P.mat('frameMat', '문틀', 'Frame', 'wood-white')],
  tags: ['pocket door', 'double pocket door', 'sliding door', 'glass door', '포켓 도어', '양쪽 포켓문', '미닫이 유리문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.035;
    doorFrame(k, W, H, t, p.frameMat);
    const lw = (W - 2 * JAMB) / 2 + 0.01, lh = H - JAMB - 0.012;
    for (const s of [-1, 1]) {
      const xc = s * (lw / 2 - 0.005) + s * clamp(p.open, 0, 0.9) * (lw - 0.08);
      withMatrix(k, M4(0, 0.008, 0), () => specLeaf(k, { stile: 0.1, rows: [{ rail: 0.2 }, { type: 'glass', grid: [1, 4] }, { rail: 0.1 }] }, { lw, lh, lt, X: (u) => xc - lw / 2 + u, zc: 0, mat: p.leafMat }));
      for (const f of [-1, 1]) {
        k.rbox('hardware', 'metal-brass', 0.04, 0.16, 0.006, 0.004, xc - s * (lw / 2 - 0.05), 1.0, f * (lt / 2 + 0.001), { segs: k.seg(2, 1) });
      }
    }
    k.box('frame', 'metal-black', W - 2 * JAMB, 0.02, lt + 0.02, 0, H - JAMB - 0.01, 0, { r: 0.002 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

const bifold = item({
  id: 'door-bifold', category: 'doors', placement: 'opening', ko: '양쪽 접이식 붙박이장 문', en: 'Bifold closet doors',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [...doorCommon(1.5, 2.1, [0.9, 2.6], [1.8, 2.6]), P.num('open', '접힘 정도', 'Fold ratio', 0, 0, 1, 0.05), P.pick('face', '문짝 형태', 'Panel face', 'louvre', FACES.filter((f) => f[0] !== 'mirror')),
    P.mat('leafMat', '문짝', 'Panels', 'wood-white'), P.mat('frameMat', '문틀', 'Frame', 'wood-white')],
  tags: ['bifold door', 'folding door', 'closet door', 'louvre door', '접이식 문', '폴딩 도어', '붙박이장 문', '옷장 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.03;
    doorFrame(k, W, H, t, p.frameMat);
    const iw = W - 2 * JAMB, pw = (iw - 0.012) / 4, ph = H - JAMB - 0.03;
    const zh = t / 2 - 0.006 - lt / 2;
    k.box('track', 'metal-aluminium', iw, 0.012, 0.03, 0, H - JAMB - 0.006, zh, { r: 0.002 });
    const a = clamp(p.open, 0, 1) * 75 * DEG;
    for (const s of [-1, 1]) {
      const x0 = s * (iw / 2 - 0.003);
      const th1 = s * a, th2 = -th1;
      const d1 = [-s * Math.cos(a), Math.sin(a)];
      const panels = [[x0, zh, th1], [x0 + d1[0] * pw, zh + d1[1] * pw, th2]];
      panels.forEach(([px, pz, th], i) => {
        const m = M4(px, 0.012, pz).multiply(new THREE.Matrix4().makeRotationY(th));
        withMatrix(k, m, () => {
          faceLeaf(k, p.face, { lw: pw - 0.003, lh: ph, lt, X: (u) => -s * u, zc: 0, mat: p.leafMat });
          if (i === 0) for (const hy of [0.25, ph - 0.25]) k.cyl('hardware', 'metal-brass', 0.007, 0.007, 0.08, -s * pw, hy - 0.04, lt / 2, { segs: k.seg(10, 5) });
          if (i === 1) addLever(k, -s * 0.05, 1.0 - 0.012, lt / 2, 1, s, 'knob', 'metal-brass', false);
        });
      });
    }
    k.userData.swing = { hinge: 'none', radius: 0, fold: 'both' };
    return k.group();
  },
});

const accordion = item({
  id: 'door-accordion', category: 'doors', placement: 'opening', ko: '아코디언 자바라 문', en: 'Accordion door',
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricX: true },
  params: [...doorCommon(1.2, 2.1, [0.7, 3.0], [1.8, 2.6]), P.num('open', '접힘 정도', 'Fold ratio', 0, 0, 1, 0.05), P.mat('leafMat', '문짝', 'Slats', 'plastic-white'), P.mat('frameMat', '문틀', 'Frame', 'wood-white')],
  tags: ['accordion door', 'folding door', 'vinyl door', '자바라 문', '아코디언 도어', '접이식 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height;
    doorFrame(k, W, H, t, p.frameMat);
    const iw = W - 2 * JAMB, lh = H - JAMB - 0.04;
    k.box('track', 'metal-aluminium', iw, 0.025, 0.05, 0, H - JAMB - 0.0125, 0, { r: 0.002 });
    const n = Math.max(6, 2 * Math.round(iw / 0.2));
    const sw = iw / n / Math.cos(18 * DEG);
    const L = (iw - 0.04) * (1 - 0.8 * clamp(p.open, 0, 1)), step = L / n;
    const a = Math.acos(clamp(step / sw, 0, 1)), D = sw * Math.sin(a);
    let x = -iw / 2;
    for (let i = 0; i < n; i++) {
      const z0 = i % 2 ? D / 2 : -D / 2, z1 = -z0;
      k.box('leaf', p.leafMat, sw, lh, 0.006, x + step / 2, 0.012 + lh / 2, (z0 + z1) / 2, { r: 0.002, ry: -Math.atan2(z1 - z0, step) });
      if (i % 2 === 0) k.cyl('leaf', p.leafMat, 0.006, 0.006, lh, x, 0.012, z0, { segs: k.seg(8, 4) });
      x += step;
    }
    // lead post with a latch pull
    k.box('post', p.frameMat, 0.04, lh, 0.05, x + 0.02, 0.012 + lh / 2, 0, { r: 0.004, segs: 2 });
    for (const s of [-1, 1]) k.rbox('hardware', 'metal-steel', 0.02, 0.14, 0.012, 0.005, x + 0.02, 1.0, s * 0.031, { segs: k.seg(2, 1) });
    k.userData.swing = { hinge: 'none', radius: 0, fold: 'left' };
    return k.group();
  },
});

const pivotDoor = item({
  id: 'door-pivot', category: 'doors', placement: 'opening', ko: '대형 피벗 도어', en: 'Pivot door',
  bboxSlack: [0.04, 0.03, 0.08], anchor: { asymmetricZ: true },
  params: [...doorCommon(1.2, 2.4, [0.9, 2.0], [2.0, 3.0]), openParam(), P.mat('leafMat', '문짝', 'Leaf', 'wood-oak'), P.mat('frameMat', '문틀', 'Frame', 'paint-black-matte'), P.mat('handleMat', '손잡이 재질', 'Pull finish', 'metal-black', 'metal')],
  tags: ['pivot door', 'front door', 'modern door', 'oversized door', '피벗 도어', '대형 현관문', '모던 현관문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.06, fj = 0.02;
    doorFrame(k, W, H, t, p.frameMat, { casing: false, jamb: fj });
    k.box('threshold', 'metal-steel', W - 2 * fj, 0.01, t, 0, 0.005, 0, { r: 0.002 });
    const lw = W - 2 * fj - 0.01, lh = H - fj - 0.02, px = -lw / 2 + lw * 0.2;
    const m = pivot(0, 0, 0, { ry: -p.open * DEG });
    m.premultiply(M4(px, 0.012, 0));
    withMatrix(k, m, () => {
      const x0 = -lw * 0.2;
      // vertical boards with fine shadow gaps
      const n = Math.max(5, Math.round(lw / 0.14)), bw = lw / n;
      k.box('leaf', p.leafMat, lw - 0.004, lh, lt - 0.008, x0 + lw / 2, lh / 2, 0, { r: 0.002 });
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.box('leaf', p.leafMat, bw - 0.004, lh, 0.004, x0 + bw * (i + 0.5), lh / 2, s * (lt / 2 - 0.002), { r: 0.001 });
      const hx = x0 + lw - 0.12, L = Math.min(1.4, lh - 0.6);
      for (const s of [-1, 1]) {
        k.rod('hardware', p.handleMat, [hx, 1.05 - L / 2, s * (lt / 2 + 0.07)], [hx, 1.05 + L / 2, s * (lt / 2 + 0.07)], 0.016, { segs: k.seg(16, 6) });
        for (const e of [-1, 1]) k.rod('hardware', p.handleMat, [hx, 1.05 + e * (L / 2 - 0.08), s * lt / 2], [hx, 1.05 + e * (L / 2 - 0.08), s * (lt / 2 + 0.07)], 0.009);
      }
      for (const y of [-0.006, lh]) k.cyl('hardware', 'metal-steel', 0.02, 0.02, 0.008, 0, y, 0, { segs: k.seg(14, 6) });
    });
    k.userData.swing = { hinge: 'left', radius: lw * 0.8, pivot: lw * 0.2 };
    return k.group();
  },
});

const frameless = item({
  id: 'door-glass-frameless', category: 'doors', placement: 'opening', ko: '강화유리 문(프레임리스)', en: 'Frameless glass door',
  bboxSlack: [0.04, 0.03, 0.08], anchor: { asymmetricZ: true },
  params: [...doorCommon(0.9, 2.1, [0.7, 1.2], [1.9, 2.6]), hingeParam(), openParam(), P.mat('glassMat', '유리', 'Glass', 'glass-clear', 'glass'), P.mat('handleMat', '하드웨어', 'Hardware', 'metal-chrome', 'metal')],
  tags: ['glass door', 'frameless door', 'tempered glass', 'office door', '유리문', '강화유리 문', '프레임리스 도어', '사무실 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.012;
    linings(k, W, H, t, 0.04, 'paint-white-matte');
    for (const s of [-1, 1]) k.box('frame', 'metal-aluminium', 0.02, H, 0.04, s * (W / 2 - 0.01), H / 2, 0, { r: 0.002 });
    k.box('frame', 'metal-aluminium', W - 0.04, 0.05, 0.04, 0, H - 0.025, 0, { r: 0.002 });
    const dir = p.hinge === 'right' ? -1 : 1, lw = W - 0.05, lh = H - 0.05 - 0.016;
    const m = pivot(0, 0, 0, { ry: -dir * p.open * DEG });
    m.premultiply(M4(dir * -(lw / 2 - 0.06), 0.01, 0));
    withMatrix(k, m, () => {
      const X = (x) => dir * x, x0 = -0.06;
      k.box('glass', p.glassMat, lw, lh, lt, X(x0 + lw / 2), lh / 2, 0, { r: 0.002 });
      // patch fittings, lock box and a ladder pull on both faces
      for (const y of [0.04, lh - 0.04]) k.rbox('hardware', p.handleMat, 0.18, 0.08, lt + 0.03, 0.006, X(x0 + 0.09), y, 0, { segs: k.seg(2, 1) });
      k.rbox('hardware', p.handleMat, 0.16, 0.08, lt + 0.03, 0.006, X(x0 + lw - 0.08), 0.04, 0, { segs: k.seg(2, 1) });
      const hx = X(x0 + lw - 0.1);
      for (const s of [-1, 1]) {
        k.rod('hardware', p.handleMat, [hx, 0.65, s * 0.06], [hx, 1.45, s * 0.06], 0.014, { segs: k.seg(14, 6) });
        for (const y of [0.75, 1.35]) k.rod('hardware', p.handleMat, [hx, y, 0], [hx, y, s * 0.06], 0.008);
      }
    });
    k.userData.swing = { hinge: p.hinge, radius: lw - 0.06 };
    return k.group();
  },
});

const garage = item({
  id: 'door-garage', category: 'doors', placement: 'opening', ko: '차고 섹션 도어', en: 'Sectional garage door',
  bboxSlack: [0.15, 0.25, 0.1], anchor: { asymmetricZ: true },
  params: [...doorCommon(2.6, 2.2, [2.0, 5.5], [1.9, 2.8]), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), P.mat('leafMat', '도어 패널', 'Panels', 'paint-grey-matte'), P.mat('trimMat', '외부 몰딩', 'Exterior trim', 'paint-white-gloss'), P.bool('windows', '창', 'Windows', true), P.bool('tracks', '천장 레일', 'Ceiling tracks', false)],
  tags: ['garage door', 'sectional door', 'overhead door', '차고 문', '셔터 도어', '오버헤드 도어', '차고'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, pt = 0.045;
    linings(k, W, H, t, 0.0, 'paint-white-matte');
    // exterior brick-mould trim
    for (const s of [-1, 1]) k.box('trim', p.trimMat, 0.08, H + 0.08, 0.02, s * (W / 2 + 0.028), (H + 0.08) / 2, -t / 2 - 0.01, { r: 0.004, segs: 2 });
    k.box('trim', p.trimMat, W + 0.136, 0.08, 0.02, 0, H + 0.04, -t / 2 - 0.01, { r: 0.004, segs: 2 });
    const pw = W + 0.08, ns = Math.max(4, Math.round(H / 0.53)), sh = H / ns;
    const z0 = t / 2 + 0.02 + pt / 2, top = H + 0.12;
    const lift = clamp(p.open, 0, 1) * (H - 0.05);
    for (let i = 0; i < ns; i++) {
      const yc = sh * (i + 0.5) + lift;
      let x = 0, y = yc, z = z0, flat = false;
      if (yc + sh / 2 > top) { flat = true; y = top + pt / 2; z = z0 + (yc - top); }
      const m = M4(x, y, z);
      if (flat) m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      withMatrix(k, m, () => {
        k.box('panels', p.leafMat, pw, sh - 0.004, pt, 0, 0, 0, { r: 0.004, segs: 2 });
        // two pressed grooves per section on the street face, windows in the top section
        for (const g of [-0.25, 0.25]) k.box('panels', p.leafMat, pw - 0.04, 0.01, 0.004, 0, g * sh, -pt / 2 - 0.0015, { r: 0.001 });
        if (p.windows && i === ns - 1) {
          const nw = Math.max(2, Math.round(pw / 0.7)), ww = pw / nw;
          for (let j = 0; j < nw; j++) {
            ring(k, 'trim', p.trimMat, ww - 0.12, sh * 0.55, 0.02, 0.008, -pw / 2 + ww * (j + 0.5), 0, -pt / 2 - 0.004);
            k.box('glass', 'glass-tinted', ww - 0.15, sh * 0.5, 0.004, -pw / 2 + ww * (j + 0.5), 0, -pt / 2 - 0.002, { r: 0 });
          }
        }
        if (i === 0) k.rbox('hardware', 'metal-black', 0.18, 0.03, 0.03, 0.008, 0, 0, -pt / 2 - 0.015, { segs: k.seg(2, 1) });
      });
    }
    // vertical + horizontal tracks inside, torsion spring shaft above
    const rl = p.tracks ? H * 0.9 : 0.25;
    for (const s of [-1, 1]) {
      const tx = s * (pw / 2 + 0.025);
      k.box('track', 'metal-steel', 0.012, top, 0.06, tx, top / 2, z0 + 0.01, { r: 0.002 });
      k.box('track', 'metal-steel', 0.012, 0.06, rl, tx, top + 0.03, z0 + rl / 2, { r: 0.002 });
    }
    k.rod('track', 'metal-steel', [-pw / 2, top + 0.15, z0 + 0.05], [pw / 2, top + 0.15, z0 + 0.05], 0.015);
    k.userData.swing = { hinge: 'none', radius: 0, overhead: true };
    return k.group();
  },
});

/* ---------------------------------------------------------------- variants */

const V = [
  variant(flush, 'walnut', '월넛 평판 문', 'Walnut flush door', { leafMat: 'wood-walnut', frameMat: 'wood-walnut', handleMat: 'metal-black' }, { tags: ['walnut', '월넛', 'veneer', '무늬목'] }),
  variant(sixPanel, 'oak', '오크 6판넬 문', 'Oak 6-panel door', { leafMat: 'wood-oak', frameMat: 'wood-oak', handle: 'lever', handleMat: 'metal-black' }, { tags: ['oak', '오크', '원목'] }),
  variant(twoPanel, 'black', '블랙 2판넬 문', 'Black 2-panel door', { leafMat: 'paint-black-matte', frameMat: 'paint-black-matte', handleMat: 'metal-brass' }, { tags: ['black', '블랙', '검정 문'] }),
  variant(halfGlass, 'oak', '오크 반유리 문', 'Oak half-glass door', { leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-black' }, { tags: ['oak', '오크'] }),
  variant(louvre, 'pine', '소나무 루버 문', 'Pine louvred door', { leafMat: 'wood-pine', frameMat: 'wood-pine', handleMat: 'metal-black' }, { tags: ['pine', '소나무', '원목'] }),
  variant(bypass, 'mirror', '거울 미닫이 붙박이장 문', 'Mirrored bypass closet doors', { face: 'mirror', leafMat: 'metal-aluminium', frameMat: 'paint-white-matte' }, { tags: ['mirror door', '거울 문', '전신 거울'] }),
  variant(garage, 'wood', '원목 차고 도어', 'Wood sectional garage door', { leafMat: 'wood-teak', trimMat: 'paint-black-matte', windows: false }, { tags: ['wood', '원목', 'teak', '티크'] }),
  variant(baseOf('door-single'), 'flat-oak', '오크 평판 여닫이문', 'Oak flat hinged door', { style: 'flat', leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-black' }, { tags: ['oak', '오크', 'flat door', '평판 문'] }),
  variant(baseOf('door-double'), 'glazed', '유리 양개문', 'Glazed double door', { style: 'glazed', leafMat: 'wood-walnut', frameMat: 'wood-walnut', handleMat: 'metal-black' }, { tags: ['glass', '유리', '양개 유리문', 'walnut', '월넛'] }),
  variant(baseOf('door-entrance'), 'black', '블랙 현관문', 'Black steel entrance door', { leafMat: 'paint-black-matte', frameMat: 'paint-black-matte' }, { tags: ['black', '블랙', '검정 현관문'] }),
];

/* ------------------------------------------------------------------ sizes */

const SIZE_CTX = { quality: 'high', wallThickness: 0.2, material: () => SIZE_MAT };
const SIZE_MAT = new THREE.MeshBasicMaterial();
/** Default size = the default build's bounding box (rounded to mm). */
export function autoSize(entry) {
  if (entry.size) return entry;
  const b = new THREE.Box3().setFromObject(entry.build({}, SIZE_CTX));
  entry.size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(Math.max(0.01, v) * 1000) / 1000);
  return entry;
}

const DESIGNS = [
  twoPanel, threePanel, sixPanel, shaker, fivePanel, flush, inlay, halfGlass, gridGlass, frostStrip, louvre, steelGlass, hanok, ledged, porthole,
  arched, archedOpening, casedOpening, dutch, cafe, frenchTransom, fanlight, sidelights, fireDoor,
  barnX, barnGlass, bypass, shoji, pocketDouble, bifold, accordion, pivotDoor, frameless, garage,
].map(autoSize);

export const ITEMS = [...DESIGNS, ...V];
void frameShape;
