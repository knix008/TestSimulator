// Floor plan samples for "Import › Floor plan…" and its tests: real-CAD-style DXF
// drawings (millimetres) of a 59 m² and an 84 m² Korean apartment, a small office
// and a two-room house, plus SVG line drawings and PNG pictures of them.
//
//   node scripts/make-plan-samples.mjs        → samples/plans/*
//
// The plans come from the app's templates (src/engine/templates.js), so the
// expected walls / doors / windows are known exactly; each sample has an
// <id>.expected.json the unit tests compare the recognised plan with.
// Drawing conventions (like Korean architectural CAD):
//   A-WALL  wall outlines: both faces, broken at openings, with jamb lines
//   A-DOOR  door: quarter arc (radius = door width) + leaf line (84 m²: a DOOR block, inserted rotated / mirrored)
//   A-WIND  window: three (sliding: four) parallel lines across the opening
//   A-TEXT  room names     A-DIMS  overall dimensions     A-FURN  furniture blocks (59 m²)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildTemplate } from '../src/engine/templates.js';
import { encodeBinaryDxf } from '../src/io/plan-dxf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'samples', 'plans');
fs.mkdirSync(outDir, { recursive: true });

const NAMES = {
  living: '거실', kitchen: '주방', dining: '식당', bedroom: '침실1', bedroom2: '침실2', bedroom3: '침실3', bedroom4: '침실4', bath: '욕실', bath2: '욕실2',
  dressing: '드레스룸', laundry: '다용도실', utility: '다용도실', hall: '복도', entry: '현관', reception: 'RECEPTION', openoffice: 'OPEN OFFICE', meeting: 'MEETING',
  director: 'DIRECTOR', pantry: 'PANTRY', toilet: 'WC', office: '서재', room: '방',
};
// Doors and windows drawn without arcs (plan metres, walls [a, b, thickness]; offsets along each wall from a).
const DOORS_VARIETY = {
  walls: [
    [[0, 0], [10, 0], 0.2], [[10, 0], [10, 7], 0.2], [[10, 7], [0, 7], 0.2], [[0, 7], [0, 0], 0.2],
    [[4, 0], [4, 7], 0.1], [[4, 4], [10, 4], 0.1], [[7, 4], [7, 7], 0.1],
  ],
  openings: [
    { wall: 2, offset: 8, width: 2.0, item: 'door-sliding', kind: 'sliding', symbol: 'sliding', side: 'left', hinge: 'left' },
    { wall: 4, offset: 2, width: 1.6, item: 'door-double', kind: 'double', symbol: 'double', side: 'left', hinge: 'left' },
    { wall: 4, offset: 5.5, width: 0.8, item: 'door-pocket', kind: 'pocket', symbol: 'pocket', side: 'left', hinge: 'left' },
    { wall: 5, offset: 4.5, width: 1.5, item: 'door-folding', kind: 'folding', symbol: 'folding', side: 'right', hinge: 'left' },
    { wall: 6, offset: 1.5, width: 0.8, item: 'door-single', symbol: 'block', block: '문-01', side: 'left', hinge: 'left' },
    { wall: 1, offset: 2, width: 0.9, item: 'door-entrance', side: 'left', hinge: 'right' },
    { wall: 1, offset: 5.5, width: 1.2, item: 'window-casement', symbol: 'rect' },
    { wall: 0, offset: 7, width: 1.8, item: 'window-casement', symbol: 'glass' },
    { wall: 0, offset: 2, width: 1.2, item: 'window-casement', symbol: 'block', block: '창-01' },
    { wall: 3, offset: 3.5, width: 1.8, item: 'window-sliding', symbol: 'block', block: 'W-SLIDING' },
  ],
  rooms: [['침실', 0, 0, 4, 7], ['거실', 4, 0, 10, 4], ['드레스룸', 4, 4, 7, 7], ['주방', 7, 4, 10, 7]],
};

const SAMPLES = [
  { id: 'apartment-59', template: 'apt59', title: '59㎡ 아파트', furniture: true, png: true, binary: true, scan: { angle: 7 } },
  { id: 'apartment-84', template: 'apt84', title: '84㎡ 아파트', doorBlocks: true, polylines: true, png: true },
  { id: 'small-office', template: 'smalloffice', title: 'Small office', svg: true, png: true },
  { id: 'house-2room', template: 'house', title: '방 2개 주택', svg: true, png: true },
  { id: 'doors-variety', custom: DOORS_VARIETY, title: '미닫이·포켓·폴딩·양개문, 여러 창 기호' },
];
const ORIGIN = [10000, 20000]; // drawing origin offset (mm), like a site drawing

const mm = (v) => Math.round(v * 1000);
const fmt = (v) => (Math.round(v * 1000) / 1000).toString();

function planOf(sample) {
  if (sample.custom) return customPlan(sample.custom);
  const project = buildTemplate(sample.template, { names: (k) => NAMES[k] ?? k });
  const level = project.levels[0].id;
  return planFrom(project, project.walls.filter((w) => w.level === level), project.openings, (project.rects ?? []).filter((r) => r.level === level));
}

/** A hand-made plan: walls [a, b, thickness], openings { wall (index), offset, width, item, kind, symbol, side, hinge }, rooms [name, x0, z0, x1, z1]. */
function customPlan(def) {
  const project = { levels: [{ id: 'L' }], rooms: def.rooms.map(() => ({ level: 'L' })) };
  const walls = def.walls.map(([a, b, thickness], i) => ({ id: `w${i}`, level: 'L', a, b, thickness }));
  const openings = def.openings.map((o) => ({ ...o, wall: `w${o.wall}`, params: o.hinge ? { hinge: o.hinge } : {} }));
  const rects = def.rooms.map(([key, x0, z0, x1, z1]) => ({ key, x0, z0, x1, z1, level: 'L' }));
  return planFrom(project, walls, openings, rects);
}

function planFrom(project, walls, allOpenings, rects) {
  // Plan metres [x, z] → drawing millimetres [X, Y] (Y up, so Y = −z).
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]); const zs = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const minX = Math.min(...xs); const maxZ = Math.max(...zs);
  const P = ([x, z]) => [mm(x - minX) + ORIGIN[0], mm(maxZ - z) + ORIGIN[1]];
  const W = walls.map((w) => ({ ...w, A: P(w.a), B: P(w.b), T: mm(w.thickness) }));
  const byId = new Map(W.map((w) => [w.id, w]));
  const openings = allOpenings.filter((o) => byId.has(o.wall)).map((o) => ({ ...o, w: byId.get(o.wall) }));
  return { project, walls: W, openings, rects, P, frame: { minX, maxZ } };
}

/** Wall outlines: union of the wall bands (ends extended by half a thickness) minus the openings, on a cell grid. */
function outlines(plan) {
  const fill = []; const cut = [];
  for (const w of plan.walls) {
    const h = w.T / 2;
    const [x0, x1] = [Math.min(w.A[0], w.B[0]), Math.max(w.A[0], w.B[0])];
    const [y0, y1] = [Math.min(w.A[1], w.B[1]), Math.max(w.A[1], w.B[1])];
    if (y0 === y1) fill.push([x0 - h, y0 - h, x1 + h, y0 + h]); else if (x0 === x1) fill.push([x0 - h, y0 - h, x0 + h, y1 + h]); else throw new Error('sample walls must be axis-aligned');
  }
  for (const o of plan.openings) {
    const { A, B, T } = o.w;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const c0 = [A[0] + d[0] * mm(o.offset - o.width / 2), A[1] + d[1] * mm(o.offset - o.width / 2)];
    const c1 = [A[0] + d[0] * mm(o.offset + o.width / 2), A[1] + d[1] * mm(o.offset + o.width / 2)];
    if (d[1] === 0) cut.push([Math.min(c0[0], c1[0]), A[1] - T / 2, Math.max(c0[0], c1[0]), A[1] + T / 2]);
    else cut.push([A[0] - T / 2, Math.min(c0[1], c1[1]), A[0] + T / 2, Math.max(c0[1], c1[1])]);
  }
  const xs = [...new Set([...fill, ...cut].flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set([...fill, ...cut].flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
  const inside = (r, x, y) => x > r[0] && x < r[2] && y > r[1] && y < r[3];
  const filled = xs.map((x, i) => ys.map((y, j) => {
    if (i + 1 >= xs.length || j + 1 >= ys.length) return false;
    const cx = (x + xs[i + 1]) / 2; const cy = (y + ys[j + 1]) / 2;
    return fill.some((r) => inside(r, cx, cy)) && !cut.some((r) => inside(r, cx, cy));
  }));
  const F = (i, j) => (i >= 0 && j >= 0 && i < xs.length - 1 && j < ys.length - 1 ? filled[i][j] : false);
  const edges = [];
  // Vertical boundary edges (merged along y), then horizontal ones.
  for (let i = 0; i < xs.length; i++) {
    let start = null; let side = 0;
    for (let j = 0; j <= ys.length - 1; j++) {
      const s = j < ys.length - 1 ? (F(i - 1, j) === F(i, j) ? 0 : F(i, j) ? 1 : -1) : 0;
      if (s !== side) { if (side !== 0) edges.push([[xs[i], ys[start]], [xs[i], ys[j]]]); start = j; side = s; }
    }
  }
  for (let j = 0; j < ys.length; j++) {
    let start = null; let side = 0;
    for (let i = 0; i <= xs.length - 1; i++) {
      const s = i < xs.length - 1 ? (F(i, j - 1) === F(i, j) ? 0 : F(i, j) ? 1 : -1) : 0;
      if (s !== side) { if (side !== 0) edges.push([[xs[start], ys[j]], [xs[i], ys[j]]]); start = i; side = s; }
    }
  }
  const cells = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) if (filled[i][j]) cells.push([xs[i], ys[j], xs[i + 1], ys[j + 1]]);
  return { edges, cells };
}

/** Edges → closed chains (for LWPOLYLINE output). */
function chains(edges) {
  const key = (p) => `${p[0]},${p[1]}`;
  const left = edges.map((e) => [...e]);
  const out = [];
  while (left.length) {
    const chain = left.shift();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const [a, b] = left[i];
        if (key(a) === key(chain.at(-1))) { chain.push(b); left.splice(i, 1); grown = true; break; }
        if (key(b) === key(chain.at(-1))) { chain.push(a); left.splice(i, 1); grown = true; break; }
      }
    }
    // Drop the points in the middle of straight runs.
    const pts = chain.filter((p, i) => i === 0 || i === chain.length - 1 || (chain[i - 1][0] - p[0]) * (chain[i + 1][1] - p[1]) !== (chain[i - 1][1] - p[1]) * (chain[i + 1][0] - p[0]));
    const closed = pts.length > 3 && key(pts[0]) === key(pts.at(-1));
    out.push({ points: closed ? pts.slice(0, -1) : pts, closed });
  }
  return out;
}

/** Door and window symbols in drawing coordinates, plus the expected openings (plan metres). */
function symbols(plan) {
  const doors = []; const windows = []; const expected = []; const extras = [];
  for (const o of plan.openings) {
    const { A, B, T } = o.w;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    // walls.js: the wall's left side is +n with n = (−dz, dx) in plan axes; mapped to drawing axes (Y = −z).
    const pd = [o.w.b[0] - o.w.a[0], o.w.b[1] - o.w.a[1]];
    const pl = Math.hypot(pd[0], pd[1]);
    const pu = [pd[0] / pl, pd[1] / pl];
    const pn = [-pu[1], pu[0]]; // plan left normal
    const n = [pn[0], -pn[1]]; // in drawing axes
    const c = [A[0] + d[0] * mm(o.offset), A[1] + d[1] * mm(o.offset)];
    const w = mm(o.width);
    const centrePlan = [o.w.a[0] + pu[0] * o.offset - plan.frame.minX, o.w.a[1] + pu[1] * o.offset - plan.frame.maxZ];
    if (o.item.startsWith('door')) {
      const s = (o.side ?? 'left') === 'left' ? 1 : -1;
      const hingeLeft = (o.params?.hinge ?? 'left') === 'left';
      const X = [d[0] * s, d[1] * s]; // the door's local +x
      const hs = hingeLeft ? -1 : 1;
      const H = [c[0] + X[0] * hs * (w / 2) + n[0] * s * (T / 2), c[1] + X[1] * hs * (w / 2) + n[1] * s * (T / 2)];
      const C = [H[0] - X[0] * hs * w, H[1] - X[1] * hs * w];
      const O = [H[0] + n[0] * s * w, H[1] + n[1] * s * w];
      // Points along the wall centre line (k = millimetres from the opening's start) and across it (j).
      const c0 = [c[0] - d[0] * w / 2, c[1] - d[1] * w / 2];
      const at = (k, j) => [c0[0] + d[0] * k + n[0] * j, c0[1] + d[1] * k + n[1] * j];
      const leaf = (k0, k1, j, depth = 40) => extras.push({ type: 'poly', closed: true, layer: 'A-DOOR', pts: [at(k0, j - depth / 2), at(k1, j - depth / 2), at(k1, j + depth / 2), at(k0, j + depth / 2)] });
      const symbol = o.symbol ?? 'arc';
      if (symbol === 'arc') doors.push({ H, C, O, w });
      else if (symbol === 'double') {
        // Two leaves of half the width, hinged at both jambs, opening to the same side.
        for (const k of [-1, 1]) {
          const h = [c[0] + d[0] * k * (w / 2) + n[0] * s * (T / 2), c[1] + d[1] * k * (w / 2) + n[1] * s * (T / 2)];
          doors.push({ H: h, C: [h[0] - d[0] * k * (w / 2), h[1] - d[1] * k * (w / 2)], O: [h[0] + n[0] * s * (w / 2), h[1] + n[1] * s * (w / 2)], w: w / 2 });
        }
      } else if (symbol === 'sliding') {
        // Two leaves side by side at different depths, overlapping in the middle.
        leaf(0, w * 0.55, -T / 4); leaf(w * 0.45, w, T / 4);
      } else if (symbol === 'pocket') {
        // One leaf, mostly slid into the wall beside the opening.
        leaf(-w * 0.6, w * 0.4, 0);
      } else if (symbol === 'folding') {
        // Panels folded in a zig-zag across the opening, standing out to one side.
        extras.push({ type: 'poly', closed: false, layer: 'A-DOOR', pts: [0, 1, 2, 3, 4].map((i) => at((i * w) / 4, i % 2 ? s * 250 : 0)) });
      } else if (symbol === 'block') {
        // A door block with an open leaf and no arc (hinge at the origin, closed along +x, open along +y).
        const ccw = (C[0] - H[0]) * (O[1] - H[1]) - (C[1] - H[1]) * (O[0] - H[0]) > 0;
        extras.push({ type: 'insert', name: o.block, p: H, sx: w, sy: ccw ? w : -w, rot: deg([C[0] - H[0], C[1] - H[1]]), layer: 'A-DOOR' });
      }
      expected.push({ kind: o.kind ?? (symbol === 'double' ? 'double' : 'door'), item: o.item, center: centrePlan, width: o.width, side: o.side ?? 'left', hinge: o.params?.hinge ?? 'left', ...(o.symbol ? { symbol: o.symbol } : {}) });
    } else {
      const c0 = [c[0] - d[0] * w / 2, c[1] - d[1] * w / 2]; const c1 = [c[0] + d[0] * w / 2, c[1] + d[1] * w / 2];
      const across = (k, from = 0, to = 0) => [[c0[0] + n[0] * k + d[0] * from, c0[1] + n[1] * k + d[1] * from], [c1[0] + n[0] * k - d[0] * to, c1[1] + n[1] * k - d[1] * to]];
      const symbol = o.symbol ?? 'lines';
      if (symbol === 'lines') {
        const offsets = o.width >= 2.4 ? [-T / 2, -20, 20, T / 2] : [-(T / 2 - 30), 0, T / 2 - 30];
        for (const k of offsets) windows.push(across(k));
      } else if (symbol === 'glass') {
        // Two frame lines on the wall faces and a shorter glass line between them.
        windows.push(across(-T / 2), across(T / 2), across(0, 50, 50));
      } else if (symbol === 'rect') {
        // A rectangle in the wall, 30 mm in from the faces.
        const [p, q] = across(-(T / 2 - 30)); const [r, t] = across(T / 2 - 30);
        extras.push({ type: 'poly', closed: true, layer: 'A-WIND', pts: [p, q, t, r] });
      } else if (symbol === 'block') {
        // A window block: unit length along +x, unit wall thickness across (y = −0.5 … 0.5).
        extras.push({ type: 'insert', name: o.block, p: c0, sx: w, sy: T, rot: deg(d), layer: 'A-WIND' });
      }
      expected.push({ kind: 'window', item: o.item, center: centrePlan, width: o.width, ...(o.symbol ? { symbol: o.symbol } : {}) });
    }
  }
  return { doors, windows, expected, extras };
}

// ───────────────────────── DXF writer (R2007, UTF-8)

class Dxf {
  constructor() { this.out = []; }
  g(code, value) { this.out.push(String(code), String(value)); }
  line(a, b, layer) { this.g(0, 'LINE'); this.g(8, layer); this.g(10, fmt(a[0])); this.g(20, fmt(a[1])); this.g(30, 0); this.g(11, fmt(b[0])); this.g(21, fmt(b[1])); this.g(31, 0); }
  poly(points, closed, layer) { this.g(0, 'LWPOLYLINE'); this.g(8, layer); this.g(90, points.length); this.g(70, closed ? 1 : 0); for (const p of points) { this.g(10, fmt(p[0])); this.g(20, fmt(p[1])); } }
  arc(c, r, a0, a1, layer) { this.g(0, 'ARC'); this.g(8, layer); this.g(10, fmt(c[0])); this.g(20, fmt(c[1])); this.g(30, 0); this.g(40, fmt(r)); this.g(50, fmt(a0)); this.g(51, fmt(a1)); }
  text(p, h, s, layer) { this.g(0, 'TEXT'); this.g(8, layer); this.g(10, fmt(p[0])); this.g(20, fmt(p[1])); this.g(30, 0); this.g(40, h); this.g(1, s); this.g(72, 1); this.g(73, 2); this.g(11, fmt(p[0])); this.g(21, fmt(p[1])); this.g(31, 0); }
  insert(name, p, sx, sy, rot, layer) { this.g(0, 'INSERT'); this.g(8, layer); this.g(2, name); this.g(10, fmt(p[0])); this.g(20, fmt(p[1])); this.g(30, 0); this.g(41, fmt(sx)); this.g(42, fmt(sy)); this.g(43, 1); this.g(50, fmt(rot)); }
}
const LAYERS = [['0', 7], ['A-WALL', 7], ['A-DOOR', 3], ['A-WIND', 4], ['A-TEXT', 2], ['A-DIMS', 1], ['A-FURN', 8]];
const deg = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

function writeDxf(sample, plan, outline, sym) {
  const body = new Dxf();
  // Walls
  if (sample.polylines) for (const ch of chains(outline.edges)) body.poly(ch.points, ch.closed, 'A-WALL');
  else for (const [a, b] of outline.edges) body.line(a, b, 'A-WALL');
  // Doors
  for (const { H, C, O, w } of sym.doors) {
    const ccw = (C[0] - H[0]) * (O[1] - H[1]) - (C[1] - H[1]) * (O[0] - H[0]) > 0;
    if (sample.doorBlocks) {
      // DOOR block: hinge at the origin, closed along +x, opening towards +y (unit size).
      const rot = deg([C[0] - H[0], C[1] - H[1]]);
      body.insert('DOOR', H, w, ccw ? w : -w, rot, 'A-DOOR');
    } else {
      const [p, q] = ccw ? [C, O] : [O, C];
      body.arc(H, w, deg([p[0] - H[0], p[1] - H[1]]), deg([q[0] - H[0], q[1] - H[1]]), 'A-DOOR');
      body.line(H, O, 'A-DOOR');
    }
  }
  for (const [a, b] of sym.windows) body.line(a, b, 'A-WIND');
  for (const x of sym.extras) {
    if (x.type === 'poly') body.poly(x.pts, x.closed, x.layer);
    else if (x.type === 'insert') body.insert(x.name, x.p, x.sx, x.sy, x.rot, x.layer);
  }
  // Room names
  for (const r of plan.rects) {
    const c = plan.P([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]);
    body.text(c, 250, NAMES[r.key] ?? r.key, 'A-TEXT');
  }
  // Overall dimensions (above and left of the plan)
  const xs = plan.walls.flatMap((w) => [w.A[0], w.B[0]]); const ys = plan.walls.flatMap((w) => [w.A[1], w.B[1]]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  body.line([x0, y1 + 1200], [x1, y1 + 1200], 'A-DIMS');
  for (const x of [x0, x1]) body.line([x, y1 + 400], [x, y1 + 1400], 'A-DIMS');
  body.text([(x0 + x1) / 2, y1 + 1400], 200, String(x1 - x0), 'A-DIMS');
  body.line([x0 - 1200, y0], [x0 - 1200, y1], 'A-DIMS');
  for (const y of [y0, y1]) body.line([x0 - 1400, y], [x0 - 400, y], 'A-DIMS');
  body.text([x0 - 1500, (y0 + y1) / 2], 200, String(y1 - y0), 'A-DIMS');
  // Furniture: a bed and a sofa as blocks
  if (sample.furniture) {
    const bed = plan.rects.find((r) => r.key === 'bedroom'); const liv = plan.rects.find((r) => r.key === 'living');
    if (bed) body.insert('BED-Q', plan.P([(bed.x0 + bed.x1) / 2, (bed.z0 + bed.z1) / 2]), 1, 1, 0, 'A-FURN');
    if (liv) body.insert('SOFA-3', plan.P([(liv.x0 + liv.x1) / 2, liv.z0 + 1.2]), 1, 1, 180, 'A-FURN');
  }
  const d = new Dxf();
  d.g(0, 'SECTION'); d.g(2, 'HEADER');
  d.g(9, '$ACADVER'); d.g(1, 'AC1021');
  d.g(9, '$INSUNITS'); d.g(70, 4);
  d.g(9, '$MEASUREMENT'); d.g(70, 1);
  d.g(9, '$EXTMIN'); d.g(10, x0 - 1500); d.g(20, y0); d.g(30, 0);
  d.g(9, '$EXTMAX'); d.g(10, x1); d.g(20, y1 + 1400); d.g(30, 0);
  d.g(0, 'ENDSEC');
  d.g(0, 'SECTION'); d.g(2, 'TABLES'); d.g(0, 'TABLE'); d.g(2, 'LAYER'); d.g(70, LAYERS.length);
  for (const [name, color] of LAYERS) { d.g(0, 'LAYER'); d.g(2, name); d.g(70, 0); d.g(62, color); d.g(6, 'CONTINUOUS'); }
  d.g(0, 'ENDTAB'); d.g(0, 'ENDSEC');
  d.g(0, 'SECTION'); d.g(2, 'BLOCKS');
  const block = (name, draw) => { d.g(0, 'BLOCK'); d.g(8, '0'); d.g(2, name); d.g(70, 0); d.g(10, 0); d.g(20, 0); d.g(30, 0); draw(); d.g(0, 'ENDBLK'); d.g(8, '0'); };
  block('DOOR', () => { d.arc([0, 0], 1, 0, 90, '0'); d.line([0, 0], [0, 1], '0'); });
  block('BED-Q', () => { d.poly([[-800, -1050], [800, -1050], [800, 1050], [-800, 1050]], true, '0'); d.poly([[-700, 600], [-100, 600], [-100, 950], [-700, 950]], true, '0'); d.poly([[100, 600], [700, 600], [700, 950], [100, 950]], true, '0'); });
  block('SOFA-3', () => { d.poly([[-1100, -450], [1100, -450], [1100, 450], [-1100, 450]], true, '0'); d.line([-1100, 250], [1100, 250], '0'); });
  if (sample.custom) {
    // Door block without an arc: the open leaf (unit door width) as a thin rectangle.
    block('문-01', () => { d.poly([[0, 0], [0.045, 0], [0.045, 1], [0, 1]], true, '0'); });
    // Window blocks (unit length × unit wall thickness): a frame with a diagonal; a sliding window's two sashes.
    block('창-01', () => { d.poly([[0, -0.35], [1, -0.35], [1, 0.35], [0, 0.35]], true, '0'); d.line([0, -0.35], [1, 0.35], '0'); });
    block('W-SLIDING', () => { d.line([0, -0.45], [1, -0.45], '0'); d.line([0, 0.45], [1, 0.45], '0'); d.line([0, -0.1], [0.55, -0.1], '0'); d.line([0.45, 0.1], [1, 0.1], '0'); });
  }
  d.g(0, 'ENDSEC');
  d.g(0, 'SECTION'); d.g(2, 'ENTITIES');
  d.out.push(...body.out);
  d.g(0, 'ENDSEC'); d.g(0, 'EOF');
  return `${d.out.join('\r\n')}\r\n`;
}

// ───────────────────────── SVG (line drawing in mm) and PNG (filled walls)

function svgOf(plan, outline, sym, { filled, scale = 1, margin = 1500 }) {
  const xs = plan.walls.flatMap((w) => [w.A[0], w.B[0]]); const ys = plan.walls.flatMap((w) => [w.A[1], w.B[1]]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - margin, Math.max(...xs) + margin, Math.min(...ys) - margin, Math.max(...ys) + margin];
  const X = (x) => fmt((x - x0) * scale); const Y = (y) => fmt((y1 - y) * scale);
  const W = (x1 - x0) * scale; const H = (y1 - y0) * scale;
  const s = (v) => fmt(v * scale);
  const parts = [];
  parts.push(filled ? `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${fmt(W)} ${fmt(H)}">` : `<svg xmlns="http://www.w3.org/2000/svg" width="${x1 - x0}mm" height="${y1 - y0}mm" viewBox="0 0 ${fmt(W)} ${fmt(H)}">`);
  parts.push(`<rect x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" fill="#ffffff"/>`);
  if (filled) parts.push(`<g fill="#222222" shape-rendering="crispEdges">${outline.cells.map(([a, b, c, d]) => `<rect x="${X(a)}" y="${Y(d)}" width="${s(c - a)}" height="${s(d - b)}"/>`).join('')}</g>`);
  else parts.push(`<g stroke="#000" stroke-width="${s(20)}" fill="none" id="A-WALL">${outline.edges.map(([a, b]) => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`).join('')}</g>`);
  parts.push(`<g stroke="#000" stroke-width="${s(filled ? 15 : 10)}" fill="none" id="A-DOOR">${sym.doors.map(({ H: h, C, O, w }) => {
    // SVG y runs down: the drawing's counter-clockwise arc is clockwise here (sweep flag 0 ↔ 1).
    const ccw = (C[0] - h[0]) * (O[1] - h[1]) - (C[1] - h[1]) * (O[0] - h[0]) > 0;
    return `<path d="M${X(C[0])} ${Y(C[1])} A${s(w)} ${s(w)} 0 0 ${ccw ? 0 : 1} ${X(O[0])} ${Y(O[1])}"/><line x1="${X(h[0])}" y1="${Y(h[1])}" x2="${X(O[0])}" y2="${Y(O[1])}"/>`;
  }).join('')}</g>`);
  parts.push(`<g stroke="#000" stroke-width="${s(10)}" id="A-WIND">${sym.windows.map(([a, b]) => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`).join('')}</g>`);
  parts.push(`<g font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="${s(250)}" text-anchor="middle" fill="#333" id="A-TEXT">${plan.rects.map((r) => { const c = plan.P([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]); return `<text x="${X(c[0])}" y="${Y(c[1])}">${NAMES[r.key] ?? r.key}</text>`; }).join('')}</g>`);
  parts.push('</svg>');
  return { svg: parts.join('\n'), width: W, height: H, origin: [x0, y1] };
}

// ───────────────────────── a scanned copy (tilted, grainy, unevenly lit)

/**
 * The plan picture as a scan: turned by `angleDeg`, with paper grain, uneven light and specks (seeded, so the
 * file is the same every run). A point q of the scan comes from p = c0 + R(angle)·(q − c1) of the original
 * picture (pixels; c0, c1 the picture centres; R the rotation [cos −sin; sin cos]).
 */
async function scanOf(png, angleDeg, file) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width; const h = info.height; const ch = info.channels;
  const t = (angleDeg * Math.PI) / 180; const c = Math.cos(t); const s = Math.sin(t);
  const W = Math.ceil(w * Math.abs(c) + h * Math.abs(s)) + 40; const H = Math.ceil(w * Math.abs(s) + h * Math.abs(c)) + 40;
  const c0 = [w / 2, h / 2]; const c1 = [W / 2, H / 2];
  let seed = 20261109;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const at = (X, Y) => (X < 0 || Y < 0 || X >= w || Y >= h ? 255 : data[(Y * w + X) * ch]);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = x + 0.5 - c1[0]; const qy = y + 0.5 - c1[1];
      const fx = c0[0] + c * qx - s * qy - 0.5; const fy = c0[1] + s * qx + c * qy - 0.5;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
      let v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      v *= 0.84 + 0.16 * (1 - (x / W + y / H) / 2); // light falling off towards one corner
      v += gauss() * 8;
      if (rnd() < 0.002) v = rnd() < 0.5 ? 60 : 255; // specks
      // Grey levels in steps of 6 (a cheap scanner; keeps the file small).
      out[y * W + x] = Math.max(0, Math.min(255, Math.round(v / 6) * 6));
    }
  }
  await sharp(Buffer.from(out), { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(file);
  return { angle: angleDeg, source: [w, h], size: [W, H] };
}

// ───────────────────────── a living room with curved walls

/**
 * Two rooms (plan metres, z down): a bedroom with a rounded corner (quarter circle, r = 1 m, drawn as a bulged
 * polyline) and a living room ending in a half circle (r = 2.5 m, ARC entities) with a window in the curve.
 * Walls 200 mm, the partition 100 mm; doors drawn with arcs, windows with three lines (arcs in the curve).
 */
function curvedSample() {
  const OX = 10000; const OY = 20000;
  const P = ([x, z]) => [mm(x) + OX, -mm(z) + OY];
  const E = ([x, z]) => [Math.round((x + OX / 1000) * 1e6) / 1e6, Math.round((z - OY / 1000) * 1e6) / 1e6];
  const pt = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  const PI = Math.PI;
  const body = new Dxf();
  const L = (a, b, layer = 'A-WALL') => body.line(P(a), P(b), layer);
  // Plan angles t0 < t1 run clockwise on the drawing (y up): the ARC goes from −t1 to −t0.
  const A = (c, r, t0, t1, layer = 'A-WALL') => body.arc(P(c), mm(r), (-t1 * 180) / PI, (-t0 * 180) / PI, layer);
  const B = (c, r, t0, t1, layer = 'A-WALL') => {
    const p = P(pt(c, r, t0)); const q = P(pt(c, r, t1));
    body.g(0, 'LWPOLYLINE'); body.g(8, layer); body.g(90, 2); body.g(70, 0);
    body.g(10, fmt(p[0])); body.g(20, fmt(p[1])); body.g(42, (-Math.tan((t1 - t0) / 4)).toFixed(9));
    body.g(10, fmt(q[0])); body.g(20, fmt(q[1]));
  };
  const cn = [1, 1]; const ce = [6, 2.5]; const al = 0.6 / 2.5;
  // Outer faces
  B(cn, 1.1, PI, 1.5 * PI);
  L([1, -0.1], [4.0, -0.1]); L([5.2, -0.1], [6, -0.1]);
  A(ce, 2.6, -PI / 2, -al); A(ce, 2.6, al, PI / 2);
  L([6, 5.1], [2.2, 5.1]); L([1.0, 5.1], [-0.1, 5.1]);
  L([-0.1, 5.1], [-0.1, 3.9]); L([-0.1, 3.0], [-0.1, 1]);
  // Bedroom
  B(cn, 0.9, PI, 1.5 * PI);
  L([1, 0.1], [2.95, 0.1]);
  L([2.95, 0.1], [2.95, 1.0]); L([2.95, 1.9], [2.95, 4.9]);
  L([2.95, 4.9], [2.2, 4.9]); L([1.0, 4.9], [0.1, 4.9]);
  L([0.1, 4.9], [0.1, 3.9]); L([0.1, 3.0], [0.1, 1]);
  // Living room
  L([3.05, 0.1], [4.0, 0.1]); L([5.2, 0.1], [6, 0.1]);
  A(ce, 2.4, -PI / 2, -al); A(ce, 2.4, al, PI / 2);
  L([6, 4.9], [3.05, 4.9]);
  L([3.05, 4.9], [3.05, 1.9]); L([3.05, 1.0], [3.05, 0.1]);
  // Jambs
  L([4.0, -0.1], [4.0, 0.1]); L([5.2, -0.1], [5.2, 0.1]);
  for (const k of [-al, al]) L(pt(ce, 2.4, k), pt(ce, 2.6, k));
  L([1.0, 4.9], [1.0, 5.1]); L([2.2, 4.9], [2.2, 5.1]);
  L([-0.1, 3.0], [0.1, 3.0]); L([-0.1, 3.9], [0.1, 3.9]);
  L([2.95, 1.0], [3.05, 1.0]); L([2.95, 1.9], [3.05, 1.9]);
  // Windows: three lines (three arcs in the curved wall)
  for (const k of [-0.07, 0, 0.07]) { L([4.0, k], [5.2, k], 'A-WIND'); L([1.0, 5 + k], [2.2, 5 + k], 'A-WIND'); }
  for (const r of [2.43, 2.5, 2.57]) A(ce, r, -al, al, 'A-WIND');
  // Doors: hinge on the inner face, quarter arc from the closed leaf to the open one, leaf line
  for (const h of [[0.1, 3.0], [3.05, 1.0]]) { A(h, 0.9, 0, PI / 2, 'A-DOOR'); L(h, [h[0] + 0.9, h[1]], 'A-DOOR'); }
  body.text(P([1.5, 2.5]), 250, '침실', 'A-TEXT');
  body.text(P([5.5, 2.5]), 250, '거실', 'A-TEXT');
  const d = new Dxf();
  d.g(0, 'SECTION'); d.g(2, 'HEADER'); d.g(9, '$ACADVER'); d.g(1, 'AC1021'); d.g(9, '$INSUNITS'); d.g(70, 4); d.g(0, 'ENDSEC');
  d.g(0, 'SECTION'); d.g(2, 'TABLES'); d.g(0, 'TABLE'); d.g(2, 'LAYER'); d.g(70, LAYERS.length);
  for (const [name, color] of LAYERS) { d.g(0, 'LAYER'); d.g(2, name); d.g(70, 0); d.g(62, color); d.g(6, 'CONTINUOUS'); }
  d.g(0, 'ENDTAB'); d.g(0, 'ENDSEC');
  d.g(0, 'SECTION'); d.g(2, 'ENTITIES'); d.out.push(...body.out); d.g(0, 'ENDSEC'); d.g(0, 'EOF');
  const expected = {
    id: 'living-curved', title: '곡선 벽 거실', units: 'mm',
    walls: [[[1, 0], [6, 0], 0.2], [[0, 5], [6, 5], 0.2], [[0, 1], [0, 5], 0.2], [[3, 0], [3, 5], 0.1]].map(([a, b, thickness]) => ({ a: E(a), b: E(b), thickness })),
    curves: [{ c: E(cn), r: 1, a0: PI, a1: 1.5 * PI, thickness: 0.2 }, { c: E(ce), r: 2.5, a0: -PI / 2, a1: PI / 2, thickness: 0.2 }],
    openings: [
      { kind: 'window', item: 'window-casement', center: E([4.6, 0]), width: 1.2 },
      { kind: 'window', item: 'window-casement', center: E([1.6, 5]), width: 1.2 },
      { kind: 'window', item: 'window-casement', center: E(pt(ce, 2.5, 0)), width: 2 * 2.5 * Math.sin(al), curved: true },
      { kind: 'door', item: 'door-entrance', center: E([0, 3.45]), width: 0.9, side: 'right', hinge: 'right' },
      { kind: 'door', item: 'door-single', center: E([3, 1.45]), width: 0.9, side: 'right', hinge: 'right' },
    ],
    rooms: 2,
  };
  return { dxf: `${d.out.join('\r\n')}\r\n`, expected };
}

const PNG_PX_PER_M = 80;
const index = [];
for (const sample of SAMPLES) {
  const plan = planOf(sample);
  const outline = outlines(plan);
  const sym = symbols(plan);
  const dxf = writeDxf(sample, plan, outline, sym);
  fs.writeFileSync(path.join(outDir, `${sample.id}.dxf`), dxf);
  const files = [`${sample.id}.dxf`];
  // Expected result, plan metres with the drawing's origin (DXF x / 1000, −y / 1000), for the tests.
  const toPlan = ([X, Y]) => [X / 1000, -Y / 1000];
  const expected = {
    id: sample.id, title: sample.title, units: 'mm',
    walls: plan.walls.map((w) => ({ a: toPlan(w.A), b: toPlan(w.B), thickness: w.thickness })),
    openings: sym.expected.map((e) => ({ ...e, center: toPlan(plan.P([e.center[0] + plan.frame.minX, e.center[1] + plan.frame.maxZ])) })),
    rooms: plan.project.rooms.filter((r) => r.level === plan.project.levels[0].id).length,
  };
  if (sample.svg) { fs.writeFileSync(path.join(outDir, `${sample.id}.svg`), svgOf(plan, outline, sym, { filled: false }).svg); files.push(`${sample.id}.svg`); }
  if (sample.png) {
    const pic = svgOf(plan, outline, sym, { filled: true, scale: PNG_PX_PER_M / 1000 });
    const png = await sharp(Buffer.from(pic.svg)).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(outDir, `${sample.id}.png`), png);
    files.push(`${sample.id}.png`);
    // Pixel → plan metres of the picture: x = X0 + px / 80, z = Z0 + py / 80.
    expected.image = { file: `${sample.id}.png`, pxPerMetre: PNG_PX_PER_M, width: Math.round(pic.width), height: Math.round(pic.height), topLeft: toPlan(pic.origin) };
    if (sample.scan) {
      const file = `${sample.id}-scan.png`;
      expected.scan = { file, ...(await scanOf(png, sample.scan.angle, path.join(outDir, file))) };
      files.push(file);
    }
  }
  if (sample.binary) {
    // The same drawing as a binary DXF (AutoCAD's "Binary DXF" save option).
    fs.writeFileSync(path.join(outDir, `${sample.id}-binary.dxf`), encodeBinaryDxf(dxf));
    files.push(`${sample.id}-binary.dxf`);
  }
  fs.writeFileSync(path.join(outDir, `${sample.id}.expected.json`), `${JSON.stringify(expected, null, 1)}\n`);
  index.push({ id: sample.id, title: sample.title, files, walls: expected.walls.length, doors: sym.expected.filter((e) => e.kind !== 'window').length, windows: sym.expected.filter((e) => e.kind === 'window').length, rooms: expected.rooms });
  console.log(`${sample.id}: ${expected.walls.length} walls, ${index.at(-1).doors} doors, ${index.at(-1).windows} windows, ${expected.rooms} rooms → ${files.join(', ')}`);
}
{
  const { dxf, expected } = curvedSample();
  fs.writeFileSync(path.join(outDir, 'living-curved.dxf'), dxf);
  fs.writeFileSync(path.join(outDir, 'living-curved.expected.json'), `${JSON.stringify(expected, null, 1)}\n`);
  index.push({ id: expected.id, title: expected.title, files: ['living-curved.dxf'], walls: expected.walls.length, curves: expected.curves.length, doors: expected.openings.filter((e) => e.kind !== 'window').length, windows: expected.openings.filter((e) => e.kind === 'window').length, rooms: expected.rooms });
  console.log(`living-curved: ${expected.walls.length} straight walls, ${expected.curves.length} curved walls, ${expected.openings.length} openings, ${expected.rooms} rooms → living-curved.dxf`);
}
fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
