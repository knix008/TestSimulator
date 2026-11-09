// Floor plan recognition: CAD lines and arcs (metres, plan axes [x, z]) → walls,
// doors, windows and passages. Pure JS (no three, no DOM).
//
// How a plan is read (the conventions of architectural CAD drawings):
//   1. Door symbols: a quarter arc (radius = door width) around the hinge, with a
//      leaf line from the hinge; lines inside the swing are the leaf and go too.
//   2. Windows: three or more parallel lines of the same length side by side
//      across a wall opening (frame and glass lines).
//   3. Walls: two parallel lines a wall thickness apart (50–450 mm). Lines are
//      paired nearest first along the parts where they overlap, so a long face
//      pairs with several shorter ones; each pair gives a centre line + thickness.
//   4. Pieces on the same centre line are joined: across a T-junction (the other
//      face runs on), across an opening with a door arc, window lines or jamb lines
//      (the opening is kept), or never (a real gap).
//   5. Wall ends are extended to the centre line of the wall they stop at
//      (corners, T-junctions, crossings), so the walls form closed rooms.
// Pictures (mode 'image') have no door arcs or window lines: gaps up to 1.2 m in a
// wall become doors and longer gaps in the thickest walls become windows.
//
// Also read:
//   • Curved walls: two concentric arcs (ARC entities or bulged polylines) a wall
//     thickness apart → a chain of short straight walls (plan-arc.js, ≤ 0.3 m,
//     chord error ≤ 1 cm) carrying `curve`; an opening in a curved wall gets one
//     straight piece of its own (the chord), so the door or window fits it.
//   • Doors without an arc: sliding doors (two leaves side by side, overlapping,
//     at different depths in the opening), pocket doors (a leaf running into the
//     wall), folding doors (a zig-zag), and CAD door / window blocks by name
//     (DOOR*, D1…, 문…, WIN*, W1…, 창…; SLIDING / 미닫이, POCKET, FOLD / 폴딩, DOUBLE / 양개).
//   • Windows as two lines and a glass line, a rectangle in the wall, or a block.

import { arcWallSegments, arcPoint } from './plan-arc.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const normAngle = (a) => ((a % TAU) + TAU) % TAU;

/** Plan-angle span of an arc (plan axes are mirrored, so take whichever end the sweep starts from): { start, ext }. */
export function arcSpan(arc) {
  const t0 = Math.atan2(arc.p0[1] - arc.c[1], arc.p0[0] - arc.c[0]);
  const t1 = Math.atan2(arc.p1[1] - arc.c[1], arc.p1[0] - arc.c[0]);
  const ext = Math.abs(arc.sweep);
  const start = Math.abs(normAngle(t0 - t1) - ext) <= Math.abs(normAngle(t1 - t0) - ext) ? t1 : t0;
  return { start: normAngle(start), ext };
}

/** What a block name says it is: { kind: 'door' | 'double' | 'sliding' | 'pocket' | 'folding' | 'window', item? } or null. */
export function blockKind(name = '') {
  const n = String(name).replace(/^.*[|$]/, ''); // xref / bound-block prefixes ("PLAN|DOOR", "PLAN$0$DOOR")
  const window = /window|^win|^w[-_ ]?\d|^w[-_]|창(?!고)|窓/i.test(n);
  const door = /door|^d[-_ ]?\d|^dr[-_ \d]|문|門|출입/i.test(n);
  if (!window && !door) return null;
  const sliding = /slid|미닫|미서기|^sd[-_ ]?\d|引/i.test(n);
  if (window) return sliding ? { kind: 'window', item: 'window-sliding' } : { kind: 'window' };
  if (/pocket|포켓|인입/i.test(n)) return { kind: 'pocket' };
  if (/fold|폴딩|접이|accord|자바라/i.test(n)) return { kind: 'folding' };
  if (sliding) return { kind: 'sliding' };
  if (/double|dbl|양개|양여닫|쌍/i.test(n)) return { kind: 'double' };
  return { kind: 'door' };
}

export const RECOGNIZE_DEFAULTS = {
  minThickness: 0.06,
  maxThickness: 0.45,
  angleTol: 1.5,        // degrees
  minPiece: 0.05,       // shortest wall piece kept while pairing (m)
  minWall: 0.2,         // shortest wall in the result (m)
  maxOpening: 5,        // widest opening joined into one wall (m)
  mode: 'auto',         // 'auto' | 'pairs' | 'single' | 'image'
  defaultThickness: 0.15,
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** A segment with its canonical direction u (angle in [0, π)), normal n, offset o = n·p and span s0 < s1 along u. */
function seg(line, index) {
  let { a, b } = line;
  let d = sub(b, a);
  const L = Math.hypot(d[0], d[1]);
  if (L < 1e-9) return null;
  let u = mul(d, 1 / L);
  // Canonical: angle in [−2°, 178°) so parallel lines share u (nearly horizontal ones all point +x).
  let angle = Math.atan2(u[1], u[0]);
  if (angle < -2 * DEG) angle += Math.PI;
  if (angle >= Math.PI - 2 * DEG) angle -= Math.PI;
  if (dot(u, [Math.cos(angle), Math.sin(angle)]) < 0) { u = mul(u, -1); [a, b] = [b, a]; d = sub(b, a); }
  const n = [-u[1], u[0]];
  return { index, line, a, b, u, n, L, o: dot(n, a), s0: dot(u, a), s1: dot(u, b), angle };
}

const parallel = (p, q, tol) => Math.abs(cross(p.u, q.u)) < Math.sin(tol);

/** Interval list helpers ([[t0, t1], …], sorted, disjoint). */
function cut(list, t0, t1) {
  const out = [];
  for (const [a, b] of list) {
    if (b <= t0 || a >= t1) { out.push([a, b]); continue; }
    if (a < t0) out.push([a, t0]);
    if (b > t1) out.push([t1, b]);
  }
  return out;
}
function intersect(list, t0, t1) {
  const out = [];
  for (const [a, b] of list) { const x = Math.max(a, t0); const y = Math.min(b, t1); if (y > x) out.push([x, y]); }
  return out;
}

/**
 * Curved walls: concentric arcs a wall thickness apart, paired nearest first over the angles where they overlap
 * (like the straight faces). Returns { pieces: [{ c, r, thickness, a0, a1 }] (centre line, plan angles a0 < a1),
 * windows: [{ c, r, start, ext }] (3+ concentric arcs over the same angles: window lines in a curved wall) } and
 * adds the arcs it uses to `usedArcs`.
 */
function curvedPairs(arcs, o, usedArcs) {
  const A = arcs.map((arc) => ({ arc, c: arc.c, r: arc.r, ...arcSpan(arc) })).filter((x) => x.r >= 0.15 && x.ext > 2 * DEG && x.ext < TAU - 1e-6);
  const concentric = (p, q) => dist(p.c, q.c) <= Math.max(0.02, Math.min(p.r, q.r) * 0.002);
  const windows = [];
  const inWindow = new Set();
  for (const p of A) {
    if (inWindow.has(p)) continue;
    const group = A.filter((q) => !inWindow.has(q) && concentric(p, q) && Math.abs(normAngle(q.start - p.start + Math.PI) - Math.PI) * p.r <= 0.03 && Math.abs(q.ext - p.ext) * p.r <= 0.06);
    if (group.length < 3) continue;
    const rs = group.map((q) => q.r);
    const spread = Math.max(...rs) - Math.min(...rs);
    if (spread < o.minThickness * 0.8 || spread > o.maxThickness + 0.15) continue;
    for (const q of group) { inWindow.add(q); usedArcs.add(q.arc); }
    windows.push({ c: p.c, r: (Math.max(...rs) + Math.min(...rs)) / 2, start: p.start, ext: p.ext, taken: false });
  }
  const rest = A.filter((x) => !inWindow.has(x));
  const pairs = [];
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const p = rest[i]; const q = rest[j];
      if (!concentric(p, q)) continue;
      const dr = Math.abs(p.r - q.r);
      if (dr < o.minThickness || dr > o.maxThickness) continue;
      const k = normAngle(q.start - p.start);
      const ov = Math.max(...[k, k - TAU].map((x) => Math.min(p.ext, x + q.ext) - Math.max(0, x)));
      if (ov * ((p.r + q.r) / 2) < Math.max(o.minPiece, dr * 0.5)) continue;
      pairs.push({ p, q, dr, ov });
    }
  }
  pairs.sort((x, y) => x.dr - y.dr || y.ov - x.ov);
  // Free parts of each arc, in angles from its own start ([0, ext]).
  const free = new Map(rest.map((x) => [x, [[0, x.ext]]]));
  const pieces = [];
  for (const { p, q, dr } of pairs) {
    const rm = (p.r + q.r) / 2;
    const k = normAngle(q.start - p.start);
    for (const shift of [k, k - TAU]) {
      let parts = free.get(p);
      for (const [x, y] of free.get(q).map(([a, b]) => [a + shift, b + shift])) {
        for (const [t0, t1] of intersect(parts, x, y)) {
          if ((t1 - t0) * rm < o.minPiece) continue;
          pieces.push({ c: [(p.c[0] + q.c[0]) / 2, (p.c[1] + q.c[1]) / 2], r: rm, thickness: dr, a0: p.start + t0, a1: p.start + t1 });
          parts = cut(parts, t0, t1);
          free.set(q, cut(free.get(q), t0 - shift, t1 - shift));
          usedArcs.add(p.arc); usedArcs.add(q.arc);
        }
      }
      free.set(p, parts);
    }
  }
  return { pieces, windows };
}

/**
 * Lines / arcs / texts (metres, plan axes) → { walls: [{ a, b, thickness }], openings: [{ wall, kind, item, offset, width,
 * height, sill, hinge, side }], texts, leftovers: [{ a, b, layer }], stats }.
 */
export function recognizePlan({ lines = [], arcs = [], texts = [], inserts = [] }, options = {}) {
  const o = { ...RECOGNIZE_DEFAULTS, ...options };
  const tol = o.angleTol * DEG;
  const segs = lines.map(seg).filter(Boolean);
  const used = new Set(); // segment indexes taken by doors, windows or walls
  const symbolLines = new Set(); // door leaves and window lines (never wall faces)
  const reserved = new Set(); // symbol lines of doors without arcs (leaves, zig-zags, door / window blocks): never wall faces

  // 0. Curved walls: concentric arcs a wall thickness apart (before the door arcs: a rounded corner is no door).
  const curvedArcs = new Set(); // arcs that are faces of curved walls or curved window lines
  const curved = o.mode === 'image' ? { pieces: [], windows: [] } : curvedPairs(arcs, o, curvedArcs);

  // 1. Door arcs (and their leaves).
  const doorArcs = [];
  for (const arc of arcs) {
    const sweep = Math.abs(arc.sweep);
    if (curvedArcs.has(arc)) continue;
    if (o.mode === 'image' || arc.r < 0.4 || arc.r > 1.6 || sweep < 55 * DEG || sweep > 125 * DEG) continue;
    const box = { x0: Math.min(arc.c[0], arc.p0[0], arc.p1[0]) - 0.03, x1: Math.max(arc.c[0], arc.p0[0], arc.p1[0]) + 0.03, z0: Math.min(arc.c[1], arc.p0[1], arc.p1[1]) - 0.03, z1: Math.max(arc.c[1], arc.p0[1], arc.p1[1]) + 0.03 };
    const inside = (p) => p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.z0 && p[1] <= box.z1;
    for (const s of segs) {
      if (used.has(s.index)) continue;
      // The leaf: from the hinge to the open (or closed) end of the arc.
      const far = dist(s.a, arc.c) < 0.05 ? s.b : dist(s.b, arc.c) < 0.05 ? s.a : null;
      const leaf = far && (dist(far, arc.p0) < arc.r * 0.15 || dist(far, arc.p1) < arc.r * 0.15);
      if (leaf || (inside(s.a) && inside(s.b) && s.L < arc.r * 1.1)) { used.add(s.index); symbolLines.add(s.index); }
    }
    doorArcs.push({ ...arc, taken: false });
  }

  // 2. Windows: 3+ parallel lines of the same span side by side.
  const windows = [];
  if (o.mode !== 'image') {
    const cand = segs.filter((s) => !used.has(s.index) && s.L >= 0.3 && s.L <= o.maxOpening);
    const parent = new Map(cand.map((s) => [s, s]));
    const find = (s) => { while (parent.get(s) !== s) s = parent.get(s); return s; };
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        const p = cand[i]; const q = cand[j];
        if (!parallel(p, q, tol)) continue;
        if (Math.abs(dot(p.n, q.a) - p.o) > o.maxThickness + 0.15) continue;
        const qs0 = dot(p.u, q.a); const qs1 = dot(p.u, q.b);
        if (Math.abs(qs0 - p.s0) < 0.03 && Math.abs(qs1 - p.s1) < 0.03) parent.set(find(q), find(p));
      }
    }
    const groups = new Map();
    for (const s of cand) { const r = find(s); groups.set(r, [...(groups.get(r) ?? []), s]); }
    for (const [root, members] of groups) {
      if (members.length < 3) continue;
      const offs = members.map((m) => dot(root.n, m.a));
      const spread = Math.max(...offs) - Math.min(...offs);
      if (spread < o.minThickness * 0.8 || spread > o.maxThickness + 0.15) continue;
      for (const m of members) { used.add(m.index); symbolLines.add(m.index); }
      windows.push({ u: root.u, n: root.n, c: (Math.max(...offs) + Math.min(...offs)) / 2, s0: root.s0, s1: root.s1, spread, lines: members.length });
    }
  }

  // 2b. Doors and windows without arcs (kept out of the wall pairing, read in the gaps below).
  const hinted = o.mode === 'image' ? [] : inserts.map((x) => ({ ...x, hint: blockKind(x.name), taken: false })).filter((x) => x.hint);
  const leaves = []; const zigzags = [];
  if (o.mode !== 'image') {
    // Lines of door / window blocks.
    for (const s of segs) if (!used.has(s.index) && s.line.block && blockKind(s.line.block)) reserved.add(s.index);
    // Leaves: thin rectangles (two parallel lines 12–60 mm apart over the same span).
    const cand = segs.filter((s) => !used.has(s.index) && !reserved.has(s.index) && s.L >= 0.25 && s.L <= 2.4).sort((p, q) => p.angle - q.angle);
    const inLeaf = new Set();
    for (let i = 0; i < cand.length; i++) {
      const p = cand[i];
      if (inLeaf.has(p.index)) continue;
      for (let j = i + 1; j < cand.length; j++) {
        const q = cand[j];
        if (q.angle - p.angle > tol) break;
        if (inLeaf.has(q.index) || !parallel(p, q, tol)) continue;
        const d = dot(p.n, q.a) - p.o;
        if (Math.abs(d) < 0.012 || Math.abs(d) > 0.06 || Math.abs(dot(p.n, q.b) - p.o - d) > 0.005) continue;
        const qs0 = Math.min(dot(p.u, q.a), dot(p.u, q.b)); const qs1 = Math.max(dot(p.u, q.a), dot(p.u, q.b));
        if (Math.abs(qs0 - p.s0) > 0.02 || Math.abs(qs1 - p.s1) > 0.02) continue;
        inLeaf.add(p.index); inLeaf.add(q.index);
        const c = p.o + d / 2;
        leaves.push({ u: p.u, n: p.n, c, a: add(mul(p.u, p.s0), mul(p.n, c)), b: add(mul(p.u, p.s1), mul(p.n, c)), depth: Math.abs(d), lines: [p.index, q.index], taken: false });
        break;
      }
    }
    for (const leaf of leaves) {
      for (const i of leaf.lines) reserved.add(i);
      // The short ends of the rectangle.
      const corners = [-1, 1].flatMap((k) => [add(leaf.a, mul(leaf.n, (k * leaf.depth) / 2)), add(leaf.b, mul(leaf.n, (k * leaf.depth) / 2))]);
      for (const s of segs) if (!used.has(s.index) && s.L <= leaf.depth + 0.01 && [s.a, s.b].every((p) => corners.some((c) => dist(c, p) < 0.01))) { reserved.add(s.index); leaf.lines.push(s.index); }
    }
    // Folding doors: zig-zags (3+ lines end to end, turning back and forth, panels of one size).
    const zc = segs.filter((s) => !used.has(s.index) && !reserved.has(s.index) && s.L >= 0.08 && s.L <= 0.9);
    const ends = new Map();
    const cell = (p) => `${Math.round(p[0] / 0.01)},${Math.round(p[1] / 0.01)}`;
    const at = (p) => { const out = []; const [x, z] = [Math.round(p[0] / 0.01), Math.round(p[1] / 0.01)]; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const s of ends.get(`${x + dx},${z + dz}`) ?? []) if (!out.includes(s)) out.push(s); return out.filter((s) => dist(s.a, p) < 0.006 || dist(s.b, p) < 0.006); };
    for (const s of zc) for (const p of [s.a, s.b]) ends.set(cell(p), [...(ends.get(cell(p)) ?? []), s]);
    const seen = new Set();
    for (const s0 of zc) {
      if (seen.has(s0)) continue;
      // Walk both ways while the joint has exactly two lines.
      const chain = [s0]; seen.add(s0);
      for (const dir of [0, 1]) {
        let cur = s0; let tip = dir ? s0.b : s0.a;
        for (;;) {
          const next = at(tip).filter((x) => x !== cur);
          if (next.length !== 1 || seen.has(next[0]) || at(tip).length !== 2) break;
          cur = next[0]; seen.add(cur);
          if (dir) chain.push(cur); else chain.unshift(cur);
          tip = dist(cur.a, tip) < 0.006 ? cur.b : cur.a;
        }
      }
      if (chain.length < 3) continue;
      // Points in order along the chain.
      const pts = [dist(chain[0].b, chain[1].a) < 0.006 || dist(chain[0].b, chain[1].b) < 0.006 ? chain[0].a : chain[0].b];
      for (const c of chain) pts.push(dist(c.a, pts.at(-1)) < 0.006 ? c.b : c.a);
      const mean = chain.reduce((x, c) => x + c.L, 0) / chain.length;
      if (chain.some((c) => Math.abs(c.L - mean) > mean * 0.3)) continue;
      let ok = true; let sign = 0;
      for (let k = 1; k + 1 < pts.length; k++) {
        const d1 = sub(pts[k], pts[k - 1]); const d2 = sub(pts[k + 1], pts[k]);
        const turn = Math.atan2(cross(d1, d2), dot(d1, d2));
        if (Math.abs(turn) < 30 * DEG || Math.abs(turn) > 160 * DEG || Math.sign(turn) === sign) { ok = false; break; }
        sign = Math.sign(turn);
      }
      if (!ok) continue;
      zigzags.push({ pts, lines: chain.map((c) => c.index), taken: false });
      for (const c of chain) reserved.add(c.index);
    }
  }

  // 3. Walls: parallel pairs, nearest first, over their free (not yet paired) parts.
  let pieces = [];
  const free = new Map();
  const pool = segs.filter((s) => !used.has(s.index) && !reserved.has(s.index) && s.L >= o.minPiece);
  for (const s of pool) free.set(s.index, [[s.s0, s.s1]]);
  const pairs = [];
  if (o.mode !== 'single') {
    const sorted = [...pool].sort((p, q) => p.angle - q.angle);
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const q = sorted[j];
        if (q.angle - p.angle > tol) break;
        if (!parallel(p, q, tol)) continue;
        const da = dot(p.n, q.a) - p.o; const db = dot(p.n, q.b) - p.o;
        if (Math.abs(da - db) > 0.01 || Math.sign(da) !== Math.sign(db)) continue;
        const delta = Math.abs(da + db) / 2;
        if (delta < o.minThickness || delta > o.maxThickness) continue;
        const qs0 = Math.min(dot(p.u, q.a), dot(p.u, q.b)); const qs1 = Math.max(dot(p.u, q.a), dot(p.u, q.b));
        const ov = Math.min(p.s1, qs1) - Math.max(p.s0, qs0);
        if (ov < Math.max(o.minPiece, delta * 0.5)) continue;
        pairs.push({ p, q, delta, side: Math.sign(da), ov });
      }
    }
    pairs.sort((x, y) => x.delta - y.delta || y.ov - x.ov);
    for (const { p, q, delta, side } of pairs) {
      // q's free parts mapped onto p's axis.
      const shift = dot(p.u, q.a) - q.s0; // q's s → p's s (same direction)
      const qFree = free.get(q.index).map(([x, y]) => [x + shift, y + shift]);
      let parts = free.get(p.index);
      for (const [x, y] of qFree) {
        for (const [t0, t1] of intersect(parts, x, y)) {
          if (t1 - t0 < o.minPiece) continue;
          const a = add(add(mul(p.u, t0), mul(p.n, p.o)), mul(p.n, (side * delta) / 2));
          const b = add(add(mul(p.u, t1), mul(p.n, p.o)), mul(p.n, (side * delta) / 2));
          pieces.push({ a, b, thickness: delta, faces: [p.index, q.index] });
          parts = cut(parts, t0, t1);
          free.set(q.index, cut(free.get(q.index), t0 - shift, t1 - shift));
          used.add(p.index); used.add(q.index);
        }
      }
      free.set(p.index, parts);
    }
  }
  let mode = o.mode;
  // Single-line plans (walls drawn as centre lines): every line is a wall of the default thickness.
  if (mode === 'single' || (mode === 'auto' && pieces.length < 2 && pool.length >= 3)) {
    mode = 'single';
    pieces = pool.filter((s) => s.L >= o.minWall).map((s) => ({ a: s.a, b: s.b, thickness: o.defaultThickness, faces: [s.index] }));
    for (const s of pool) used.add(s.index);
  }

  // Pictures: keep the wall thicknesses the plan really uses (text and symbols pair at odd distances).
  if (mode === 'image' && pieces.length) {
    const bins = new Map();
    const len = (p) => dist(p.a, p.b);
    for (const p of pieces) bins.set(Math.round(p.thickness / 0.02), (bins.get(Math.round(p.thickness / 0.02)) ?? 0) + len(p));
    const total = [...bins.values()].reduce((x, y) => x + y, 0);
    const keep = new Set([...bins].filter(([, l]) => l >= total * 0.08).flatMap(([k]) => [k - 1, k, k + 1]));
    pieces = pieces.filter((p) => keep.has(Math.round(p.thickness / 0.02)));
  }

  // 4. Bands: pieces on one centre line with one thickness, joined along it.
  const bands = [];
  for (const piece of pieces.map((x) => ({ ...seg(x, -1), thickness: x.thickness, faces: x.faces }))) {
    const band = bands.find((b) => parallel(b, piece, tol) && Math.abs(dot(b.n, piece.a) - b.o) < 0.02 && Math.abs(b.thickness - piece.thickness) < (o.bandTolerance ?? 0.02));
    if (band) band.pieces.push(piece); else bands.push({ u: piece.u, n: piece.n, o: piece.o, angle: piece.angle, thickness: piece.thickness, pieces: [piece] });
  }
  for (const band of bands) band.pieces.sort((p, q) => p.s0 - q.s0);
  // Thin pieces sitting in a gap of a thicker band are the lines of a two-line window.
  const thinWindows = [];
  for (const band of bands) {
    for (const host of bands) {
      if (host === band || host.thickness <= band.thickness + 0.015 || !parallel(host, band, tol) || Math.abs(band.o - host.o) > host.thickness / 2) continue;
      band.pieces = band.pieces.filter((p) => {
        const before = host.pieces.some((h) => Math.abs(h.s1 - p.s0) < 0.06);
        const after = host.pieces.some((h) => Math.abs(h.s0 - p.s1) < 0.06);
        if (!before || !after) return true;
        thinWindows.push({ u: host.u, n: host.n, c: host.o, s0: p.s0, s1: p.s1 });
        return false;
      });
    }
  }
  const allSegs = segs;
  const facesCover = (band, s0, s1) => [-1, 1].some((side) => {
    const off = band.o + (side * band.thickness) / 2;
    return allSegs.some((s) => !symbolLines.has(s.index) && !reserved.has(s.index) && parallel(s, band, tol) && Math.abs(dot(band.n, s.a) - off) < 0.015 && Math.min(dot(band.u, s.a), dot(band.u, s.b)) <= s0 + 0.01 && Math.max(dot(band.u, s.a), dot(band.u, s.b)) >= s1 - 0.01);
  });
  const capAt = (band, s) => allSegs.some((x) => Math.abs(dot(x.u, band.u)) < Math.sin(5 * DEG) && x.L <= band.thickness + 0.06
    && [x.a, x.b].every((p) => Math.abs(dot(band.n, p) - band.o) <= band.thickness / 2 + 0.03) && Math.abs(dot(band.u, x.a) - s) < 0.03);
  /** The jamb line across a band nearest to `s` (within 8 cm): its position along the band, or null. */
  const capNear = (band, s) => {
    let best = null;
    for (const x of allSegs) {
      if (Math.abs(dot(x.u, band.u)) >= Math.sin(5 * DEG) || x.L > band.thickness + 0.06) continue;
      if (![x.a, x.b].every((p) => Math.abs(dot(band.n, p) - band.o) <= band.thickness / 2 + 0.03)) continue;
      const cs = (dot(band.u, x.a) + dot(band.u, x.b)) / 2;
      if (Math.abs(cs - s) <= 0.08 && (best == null || Math.abs(cs - s) < Math.abs(best - s))) best = cs;
    }
    return best;
  };
  const maxT = Math.max(0, ...bands.map((b) => b.thickness));

  /** Doors and windows without an arc in the gap [s0, s1] of a band: blocks by name, zig-zags, leaves. */
  const classifySymbol = (band, s0, s1) => {
    const g = s1 - s0;
    const off = (p) => dot(band.n, p) - band.o;
    const sOf = (p) => dot(band.u, p);
    const overlap = (a, b) => Math.min(s1, Math.max(a, b)) - Math.max(s0, Math.min(a, b));
    // Blocks named as doors or windows, over the gap.
    let best = null;
    for (const ins of hinted) {
      if (ins.taken) continue;
      const corners = [ins.min, ins.max, [ins.min[0], ins.max[1]], [ins.max[0], ins.min[1]]];
      const ss = corners.map(sOf); const oo = corners.map(off);
      const lo = Math.min(...ss); const hi = Math.max(...ss);
      const ov = Math.min(s1, hi) - Math.max(s0, lo);
      // A door block drawn open with no arc is only its leaf: standing out of the wall at one jamb.
      const atJamb = ins.hint.kind !== 'window' && lo >= s0 - 0.1 && hi <= s1 + 0.1 && Math.min(Math.abs(lo - s0), Math.abs(hi - s1)) < 0.1 && Math.max(...oo.map(Math.abs)) >= g * 0.5;
      if ((ov < g * 0.5 && !atJamb) || hi - lo > g * 1.6 + 0.3) continue;
      if (Math.min(...oo) > band.thickness / 2 + 0.05 || Math.max(...oo) < -band.thickness / 2 - 0.05) continue;
      if (!best || ov > best.ov) best = { ins, ov, mid: (Math.min(...ss) + Math.max(...ss)) / 2, side: (Math.min(...oo) + Math.max(...oo)) / 2 };
    }
    if (best) {
      const { ins } = best;
      ins.taken = true;
      for (const s of allSegs) if (reserved.has(s.index) && s.line.block === ins.name && [s.a, s.b].every((p) => p[0] >= ins.min[0] - 0.01 && p[0] <= ins.max[0] + 0.01 && p[1] >= ins.min[1] - 0.01 && p[1] <= ins.max[1] + 0.01)) used.add(s.index);
      const hint = ins.hint;
      if (hint.kind === 'door' || hint.kind === 'double') {
        // The leaf opens to the side the block reaches out to; the hinge is at the jamb nearer the block's middle.
        return { kind: hint.kind, swing: Math.abs(best.side) > band.thickness / 2 ? Math.sign(best.side) : 1, hingeS: Math.abs(best.mid - s0) <= Math.abs(best.mid - s1) ? s0 : s1, block: ins.name };
      }
      return { kind: hint.kind, ...(hint.item ? { item: hint.item } : {}), block: ins.name };
    }
    // Folding doors: a zig-zag across the gap.
    const zig = zigzags.find((z) => !z.taken && z.pts.every((p) => sOf(p) >= s0 - 0.1 && sOf(p) <= s1 + 0.1 && Math.abs(off(p)) <= band.thickness / 2 + 0.8)
      && Math.max(...z.pts.map(sOf)) - Math.min(...z.pts.map(sOf)) >= g * 0.5);
    if (zig) { zig.taken = true; for (const i of zig.lines) used.add(i); return { kind: 'folding' }; }
    // Leaves: thin rectangles, or single lines inside the wall, along the gap.
    const inWall = (p) => Math.abs(off(p)) <= band.thickness / 2 + 0.01;
    const found = [
      ...leaves.filter((l) => !l.taken && parallel(l, band, tol) && inWall(l.a) && inWall(l.b) && overlap(sOf(l.a), sOf(l.b)) >= g * 0.3).map((l) => ({ leaf: l, s0: Math.min(sOf(l.a), sOf(l.b)), s1: Math.max(sOf(l.a), sOf(l.b)), c: off(l.a), lines: l.lines })),
      ...allSegs.filter((x) => !used.has(x.index) && !reserved.has(x.index) && parallel(x, band, tol) && inWall(x.a) && inWall(x.b) && overlap(sOf(x.a), sOf(x.b)) >= g * 0.3 && x.L <= g * 1.6)
        .map((x) => ({ s0: Math.min(sOf(x.a), sOf(x.b)), s1: Math.max(sOf(x.a), sOf(x.b)), c: off(x.a), lines: [x.index] })),
    ];
    const take = (list, kind) => { for (const f of list) { if (f.leaf) f.leaf.taken = true; for (const i of f.lines) used.add(i); } return { kind }; };
    // Pocket door: a leaf (rectangle) running on into the wall beside the opening.
    const pocket = found.find((f) => f.leaf && (f.s0 < s0 - g * 0.25 || f.s1 > s1 + g * 0.25));
    if (pocket) return take([pocket], 'pocket');
    // Sliding door: two or more leaves at different depths, each shorter than the gap, overlapping, covering it together.
    const short = found.filter((f) => f.s1 - f.s0 < g * 0.95 && f.s1 - f.s0 >= g * 0.3);
    if (short.length >= 2) {
      const depths = short.map((f) => f.c);
      const lap = short.some((f, i) => short.some((h, j) => j > i && Math.abs(f.c - h.c) >= 0.015 && Math.min(f.s1, h.s1) - Math.max(f.s0, h.s0) > 0.02));
      let covered = 0; let reach = s0;
      for (const f of [...short].sort((x, y) => x.s0 - y.s0)) { const a = Math.max(reach, f.s0, s0); const b = Math.min(f.s1, s1); if (b > a) { covered += b - a; reach = b; } }
      if (lap && Math.max(...depths) - Math.min(...depths) >= 0.015 && covered >= g * 0.85) return take(short, 'sliding');
    }
    return null;
  };

  /** What fills the gap [s0, s1] of a band: { kind, … } or null. */
  const classify = (band, s0, s1) => {
    const g = s1 - s0;
    const inBand = (p, extra = 0.06) => Math.abs(dot(band.n, p) - band.o) <= band.thickness / 2 + extra;
    // Doors: arcs hinged at either jamb.
    const hits = doorArcs.filter((arc) => !arc.taken && inBand(arc.c, 0.08) && (Math.abs(dot(band.u, arc.c) - s0) < 0.15 || Math.abs(dot(band.u, arc.c) - s1) < 0.15) && arc.r >= g * 0.35 && arc.r <= g * 1.2);
    if (hits.length) {
      const leaves = hits.length >= 2 && hits.every((h) => h.r < g * 0.75) ? hits.slice(0, 2) : [hits.sort((x, y) => Math.abs(y.r - g) < Math.abs(x.r - g) ? 1 : -1)[0]];
      for (const h of leaves) h.taken = true;
      const h = leaves[0];
      const open = Math.abs(dot(band.n, h.p0) - band.o) > Math.abs(dot(band.n, h.p1) - band.o) ? h.p0 : h.p1;
      return { kind: leaves.length === 2 ? 'double' : 'door', swing: Math.sign(dot(band.n, open) - band.o) || 1, hingeS: dot(band.u, h.c) };
    }
    const symbol = classifySymbol(band, s0, s1);
    if (symbol) return symbol;
    // Windows: line clusters, two-line windows, or single lines across the gap.
    const across = (w) => parallel(w, band, tol) && Math.abs(w.c - band.o) <= band.thickness / 2 + 0.03 && w.s0 >= s0 - 0.06 && w.s1 <= s1 + 0.06 && w.s1 - w.s0 >= g * 0.6;
    const win = [...windows, ...thinWindows].find(across);
    if (win) { win.taken = true; return { kind: 'window' }; }
    const single = allSegs.find((x) => !used.has(x.index) && !reserved.has(x.index) && across({ u: x.u, c: dot(band.n, x.a), s0: Math.min(dot(band.u, x.a), dot(band.u, x.b)), s1: Math.max(dot(band.u, x.a), dot(band.u, x.b)) }) && inBand(x.b, 0.03));
    if (single) { used.add(single.index); return { kind: 'window' }; }
    if (mode === 'image') {
      if (g <= 1.2) return { kind: 'door', swing: 1, hingeS: s0 };
      if (band.thickness >= maxT * 0.75 && g <= 4) return { kind: 'window' };
      return null;
    }
    if (g <= 3 && capAt(band, s0) && capAt(band, s1)) return { kind: 'passage' };
    return null;
  };

  // Runs: joined pieces with their openings.
  const runs = [];
  for (const band of bands) {
    let run = null;
    for (const p of band.pieces) {
      if (run) {
        const g = p.s0 - run.s1;
        let join = g <= 0.03 ? { kind: 'join' } : null;
        // Window lines in the gap first: frame lines drawn on the wall faces would otherwise read as the wall going on.
        if (!join && g >= 0.3 && g <= o.maxOpening) {
          const win = [...windows, ...thinWindows].find((w) => !w.taken && parallel(w, band, tol) && Math.abs(w.c - band.o) <= band.thickness / 2 + 0.03 && w.s0 >= run.s1 - 0.06 && w.s1 <= p.s0 + 0.06 && w.s1 - w.s0 >= g * 0.6);
          // The opening runs from jamb line to jamb line (a short stub of face may have paired next to a jamb).
          if (win) { win.taken = true; join = { kind: 'window', s0: capNear(band, run.s1) ?? run.s1, s1: capNear(band, p.s0) ?? p.s0 }; }
        }
        if (!join && g <= o.maxOpening && facesCover(band, run.s1, p.s0)) join = { kind: 'join' };
        if (!join && g <= o.maxOpening && g >= 0.3) join = classify(band, run.s1, p.s0);
        if (join) {
          if (join.kind !== 'join') run.openings.push({ s0: run.s1, s1: p.s0, ...join });
          run.s1 = Math.max(run.s1, p.s1);
          run.solid += p.s1 - p.s0;
          continue;
        }
        runs.push(run);
      }
      run = { band, s0: p.s0, s1: p.s1, openings: [], solid: p.s1 - p.s0 };
    }
    if (run) runs.push(run);
  }
  // Pictures: a run that is mostly gaps is text or symbols lined up by chance.
  if (mode === 'image') for (let i = runs.length - 1; i >= 0; i--) if (runs[i].solid < (runs[i].s1 - runs[i].s0) * 0.25 || runs[i].solid < 0.25) runs.splice(i, 1);

  /** Curved runs (pieces on one circle joined along it, openings in the gaps) → chains of straight walls. */
  function curvedWalls({ pieces: cpieces, windows: cwindows }) {
    const cbands = [];
    for (const piece of cpieces) {
      const b = cbands.find((x) => dist(x.c, piece.c) <= 0.02 && Math.abs(x.r - piece.r) <= 0.02 && Math.abs(x.thickness - piece.thickness) <= 0.02);
      if (b) b.pieces.push(piece); else cbands.push({ c: piece.c, r: piece.r, thickness: piece.thickness, ref: piece.a0, pieces: [piece] });
    }
    /** What fills the gap between local angles s0 < s1 of a curved band. */
    const classifyCurved = (b, s0, s1) => {
      const pad = 0.06 / b.r;
      const local = (ang) => normAngle(ang - b.ref);
      const inSpan = (ang) => [local(ang), local(ang) + TAU, local(ang) - TAU].some((x) => x >= s0 - pad && x <= s1 + pad);
      const A = arcPoint(b.c, b.r, b.ref + s0); const B = arcPoint(b.c, b.r, b.ref + s1);
      const chord = dist(A, B);
      const radial = (p) => Math.abs(dist(p, b.c) - b.r);
      const win = cwindows.find((w) => !w.taken && dist(w.c, b.c) <= 0.03 && Math.abs(w.r - b.r) <= b.thickness / 2 && inSpan(w.start) && inSpan(w.start + w.ext) && w.ext * b.r >= (s1 - s0) * b.r * 0.6);
      if (win) { win.taken = true; return { kind: 'window' }; }
      const hits = doorArcs.filter((arc) => !arc.taken && radial(arc.c) <= b.thickness / 2 + 0.08 && Math.min(dist(arc.c, A), dist(arc.c, B)) < 0.15 + b.thickness / 2 && arc.r >= chord * 0.35 && arc.r <= chord * 1.2);
      if (hits.length) {
        const two = hits.length >= 2 && hits.every((h) => h.r < chord * 0.75);
        const leaves = two ? hits.slice(0, 2) : [hits.sort((x, y) => Math.abs(x.r - chord) - Math.abs(y.r - chord))[0]];
        for (const h of leaves) h.taken = true;
        const h = leaves[0];
        return { kind: two ? 'double' : 'door', hingeP: h.c, openP: radial(h.p0) > radial(h.p1) ? h.p0 : h.p1 };
      }
      const line = allSegs.find((x) => !used.has(x.index) && !reserved.has(x.index) && x.L >= chord * 0.6 && [x.a, x.b].every((p) => radial(p) <= b.thickness / 2 + 0.03 && inSpan(Math.atan2(p[1] - b.c[1], p[0] - b.c[0]))));
      if (line) { used.add(line.index); return { kind: 'window' }; }
      return null;
    };
    const cruns = [];
    for (const b of cbands) {
      const local = b.pieces.map((p) => { const s0 = normAngle(p.a0 - b.ref); return { s0, s1: s0 + (p.a1 - p.a0) }; }).sort((x, y) => x.s0 - y.s0);
      const mine = [];
      let run = null;
      const joinGap = (from, to) => {
        const gap = (to - from) * b.r;
        if (gap <= 0.03) return { kind: 'join' };
        return gap >= 0.3 && gap <= o.maxOpening ? classifyCurved(b, from, to) : null;
      };
      for (const p of local) {
        if (run) {
          const join = joinGap(run.s1, p.s0);
          if (join) { if (join.kind !== 'join') run.openings.push({ ...join, s0: run.s1, s1: p.s0 }); run.s1 = Math.max(run.s1, p.s1); continue; }
          mine.push(run);
        }
        run = { band: b, s0: p.s0, s1: p.s1, openings: [] };
      }
      if (run) mine.push(run);
      // Round the circle: the last run may reach on to the first one (a ring, or an opening across the start).
      if (mine.length) {
        const first = mine[0]; const last = mine.at(-1);
        const join = last.s1 - last.s0 < TAU - 1e-6 ? joinGap(last.s1, first.s0 + TAU) : null;
        if (join) {
          const shifted = first === last ? [] : first.openings.map((x) => ({ ...x, s0: x.s0 + TAU, s1: x.s1 + TAU }));
          if (join.kind !== 'join') last.openings.push({ ...join, s0: last.s1, s1: first.s0 + TAU });
          if (first !== last) { last.openings.push(...shifted); last.s1 = first.s1 + TAU; mine.shift(); } else last.s1 = first.s0 + TAU;
        }
      }
      cruns.push(...mine);
    }
    let count = 0;
    return cruns.map((run) => {
      const b = run.band;
      const curve = { id: `plan-arc-${++count}`, cx: b.c[0], cz: b.c[1], r: b.r, a0: b.ref + run.s0, a1: b.ref + run.s1 };
      const parts = []; let at = run.s0;
      for (const op of [...run.openings].sort((x, y) => x.s0 - y.s0)) { if (op.s0 > at + 1e-9) parts.push({ s0: at, s1: op.s0 }); parts.push({ s0: op.s0, s1: op.s1, op }); at = op.s1; }
      if (run.s1 > at + 1e-9) parts.push({ s0: at, s1: run.s1 });
      const chain = [];
      for (const part of parts) {
        const a0 = b.ref + part.s0; const a1 = b.ref + part.s1;
        // An opening gets one straight piece (its chord) so the door or window fits; the rest follows the arc.
        const segments = part.op ? [{ a: arcPoint(b.c, b.r, a0), b: arcPoint(b.c, b.r, a1) }] : arcWallSegments(b.c, b.r, a0, a1);
        for (const sg of segments) {
          const d = sub(sg.b, sg.a); const L = Math.hypot(d[0], d[1]); const u = mul(d, 1 / L); const n = [-u[1], u[0]];
          const openings = [];
          if (part.op) {
            const op = part.op; const s0 = dot(u, sg.a); const s1 = dot(u, sg.b);
            const entry = { kind: op.kind, s0, s1, ...(op.item ? { item: op.item } : {}) };
            if (op.hingeP) {
              const hs = dot(u, op.hingeP);
              entry.hingeS = Math.abs(hs - s0) <= Math.abs(hs - s1) ? s0 : s1;
              entry.swing = Math.sign(dot(n, sub(op.openP, sg.a))) || 1;
            }
            openings.push(entry);
          }
          chain.push({ a: sg.a, b: sg.b, thickness: b.thickness, curve, curved: true, run: { band: { pieces: [] }, openings } });
        }
      }
      return chain;
    });
  }

  // 5. Walls with ends extended to the walls they meet.
  const walls = runs.map((r) => {
    const base = mul(r.band.n, r.band.o);
    return { a: add(base, mul(r.band.u, r.s0)), b: add(base, mul(r.band.u, r.s1)), thickness: r.band.thickness, run: r };
  });
  const chains = curvedWalls(curved, o);
  for (const chain of chains) walls.push(...chain);
  const arcEnds = chains.flatMap((c) => [c[0].a, c.at(-1).b]);
  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls) {
      if (w.curved) continue; // arcs keep their ends; straight walls reach to them
      for (const end of ['a', 'b']) {
        const d = sub(w.b, w.a); const L = Math.hypot(d[0], d[1]);
        if (L < 1e-6) continue;
        const u = mul(d, 1 / L);
        const out = end === 'a' ? mul(u, -1) : u;
        const E = w[end];
        // An end where an arc wall starts is joined already (the arc's end snaps to it below).
        const atArc = arcEnds.some((p) => dist(p, E) <= w.thickness / 2);
        let best = null;
        for (const v of walls) {
          if (v === w || (atArc && v.curved)) continue;
          const vd = sub(v.b, v.a); const vL = Math.hypot(vd[0], vd[1]);
          if (vL < 1e-6) continue;
          const vu = mul(vd, 1 / vL);
          const den = cross(u, vu);
          if (Math.abs(den) < Math.sin(20 * DEG)) continue;
          const t = cross(sub(v.a, E), vu) / den; // E + u·t on v's line
          const I = add(E, mul(u, t));
          const e = dot(sub(I, E), out);
          const reach = v.thickness / 2 + w.thickness / 2 + 0.06;
          // Pictures lose the short stub between a door and the wall it is next to: reach over a door width.
          const far = mode === 'image' && pass === 0 ? 1.25 : reach;
          if (e < -(v.thickness / 2 + 0.03) || e > far) continue;
          const tv = dot(sub(I, v.a), vu);
          if (tv < -(w.thickness / 2 + 0.06) || tv > vL + w.thickness / 2 + 0.06) continue;
          if (!best || Math.abs(e) < Math.abs(best.e)) best = { e, I, door: e > reach ? e - v.thickness / 2 : 0 };
        }
        if (best) {
          if (best.door >= 0.5) {
            const sOld = dot(w.run.band.u, E); const sNew = dot(w.run.band.u, best.I);
            const s0 = end === 'a' ? sNew + (sOld - sNew) - best.door : sOld;
            w.run.openings.push({ kind: 'door', swing: 1, hingeS: s0, s0, s1: s0 + best.door });
          }
          w[end] = best.I;
        }
      }
    }
  }
  // Curved chains end exactly on the straight walls they run into (end points shared, so rooms close).
  for (const chain of chains) {
    const ends = [[chain[0], 'a'], [chain.at(-1), 'b']];
    if (dist(chain[0].a, chain.at(-1).b) < 1e-6) continue; // a ring
    for (const [w, end] of ends) {
      let best = null;
      for (const v of walls) {
        if (v.curved) continue;
        for (const p of [v.a, v.b]) { const d = dist(p, w[end]); if (d <= w.thickness / 2 + v.thickness / 2 + 0.05 && (!best || d < best.d)) best = { d, p }; }
      }
      if (best) w[end] = [...best.p];
    }
  }
  // Short walls standing free (touching no other wall at either end) are furniture or symbols drawn with two lines.
  const meets = (v, w, p) => {
    const d = sub(v.b, v.a); const L2 = dot(d, d) || 1;
    const t = Math.max(0, Math.min(1, dot(sub(p, v.a), d) / L2));
    return dist(p, add(v.a, mul(d, t))) <= v.thickness / 2 + w.thickness / 2 + 0.05;
  };
  const touches = (w, p) => walls.some((v) => v !== w && meets(v, w, p));
  for (const w of walls) w.free = dist(w.a, w.b) < 1.5 && !touches(w, w.a) && !touches(w, w.b);
  // Small groups of walls apart from the building (furniture, symbols, a legend) go too.
  const group = new Map(walls.map((w) => [w, w]));
  const find = (w) => { while (group.get(w) !== w) w = group.get(w); return w; };
  for (const w of walls) for (const v of walls) if (v !== w && (meets(v, w, w.a) || meets(v, w, w.b))) group.set(find(w), find(v));
  const sizes = new Map();
  for (const w of walls) sizes.set(find(w), (sizes.get(find(w)) ?? 0) + dist(w.a, w.b));
  const biggest = Math.max(0, ...sizes.values());
  for (const w of walls) if (sizes.get(find(w)) < Math.min(6, biggest * 0.25)) w.free = true;
  // A thinner wall inside a longer one's band (window frame lines read as a wall) is a duplicate.
  for (const w of walls) {
    const d = sub(w.b, w.a); const L = Math.hypot(d[0], d[1]) || 1; const u = mul(d, 1 / L);
    w.free ||= !w.curved && walls.some((v) => {
      if (v === w || v.free || v.curved || v.thickness < w.thickness) return false;
      const vd = sub(v.b, v.a); const vL = Math.hypot(vd[0], vd[1]) || 1; const vu = mul(vd, 1 / vL); const vn = [-vu[1], vu[0]];
      if (Math.abs(cross(u, vu)) > Math.sin(2 * DEG) || vL < L) return false;
      if ([w.a, w.b].some((p) => Math.abs(dot(vn, sub(p, v.a))) > v.thickness / 2)) return false;
      return [w.a, w.b].every((p) => dot(vu, sub(p, v.a)) >= -0.1 && dot(vu, sub(p, v.a)) <= vL + 0.1);
    });
  }
  // Openings: centre and width along the final wall.
  const result = { walls: [], openings: [], texts, leftovers: [], mode, stats: {} };
  for (const w of walls) {
    const L = dist(w.a, w.b);
    if ((L < o.minWall && !w.curved) || L < 1e-6 || w.free) { for (const i of w.run.band.pieces.flatMap((p) => p.faces ?? [])) used.delete(i); continue; }
    const index = result.walls.length;
    result.walls.push({ a: w.a, b: w.b, thickness: Math.round(w.thickness * 1000) / 1000, ...(w.curve ? { curve: w.curve } : {}) });
    const u = mul(sub(w.b, w.a), 1 / L);
    const sa = dot(u, w.a);
    for (const op of w.run.openings) {
      const width = op.s1 - op.s0;
      const offset = (op.s0 + op.s1) / 2 - sa;
      const entry = { wall: index, kind: op.kind, offset, width, ...openingDefaults(op.kind, width), ...(op.item ? { item: op.item } : {}), ...(op.block ? { block: op.block } : {}) };
      if (op.kind === 'door' || op.kind === 'double') {
        // Plan arcs → the door's front side and hinge (builder.js: front +Z faces the wall's left side unless side = 'right').
        entry.side = op.swing > 0 ? 'left' : 'right';
        const hingeLocal = (op.hingeS - (op.s0 + op.s1) / 2) * (entry.side === 'left' ? 1 : -1);
        entry.hinge = hingeLocal < 0 ? 'left' : 'right';
      }
      result.openings.push(entry);
    }
  }
  // 6. Leftovers: unused lines away from the walls (furniture, fixtures, notes) stay as reference lines.
  const nearWall = (s) => s.L <= o.maxThickness + 0.06 && result.walls.some((w) => {
    const d = sub(w.b, w.a); const L = Math.hypot(d[0], d[1]); const u = mul(d, 1 / L); const n = [-u[1], u[0]];
    return [s.a, s.b].every((p) => Math.abs(dot(n, sub(p, w.a))) <= w.thickness / 2 + 0.05 && dot(u, sub(p, w.a)) >= -0.3 && dot(u, sub(p, w.a)) <= L + 0.3);
  });
  for (const s of segs) if (!used.has(s.index) && !nearWall(s)) result.leftovers.push({ a: s.line.a, b: s.line.b, layer: s.line.layer });
  for (const arc of arcs) if (!curvedArcs.has(arc) && !doorArcs.some((d) => d.taken && d.c === arc.c)) result.leftovers.push(...arcLines(arc).map(([a, b]) => ({ a, b, layer: arc.layer })));
  result.stats = {
    lines: segs.length, arcs: arcs.length, pairs: pieces.length, walls: result.walls.length,
    curves: new Set(result.walls.filter((w) => w.curve).map((w) => w.curve.id)).size,
    doors: result.openings.filter((x) => DOOR_KINDS.has(x.kind)).length,
    windows: result.openings.filter((x) => x.kind === 'window').length,
    passages: result.openings.filter((x) => x.kind === 'passage').length,
    leftovers: result.leftovers.length,
  };
  return result;
}

/** Opening kinds that are doors. */
export const DOOR_KINDS = new Set(['door', 'double', 'sliding', 'pocket', 'folding']);

/** Item, height and sill of an opening of `kind` and `width` (like the templates: big windows are balcony doors). */
export function openingDefaults(kind, width) {
  if (kind === 'door') return { item: 'door-single', height: 2.1, sill: 0 };
  if (kind === 'double') return { item: 'door-double', height: 2.1, sill: 0 };
  // Doors without a swing: the library's sliding, pocket and folding doors (each kind's own width range).
  if (kind === 'sliding') return width >= 1.4 ? { item: 'door-sliding', height: 2.2, sill: 0 } : width >= 1.0 ? { item: 'door-bypass', height: 2.1, sill: 0 } : { item: 'door-barn', height: 2.1, sill: 0 };
  if (kind === 'pocket') return { item: width >= 1.4 ? 'door-pocket-double' : 'door-pocket', height: 2.1, sill: 0 };
  if (kind === 'folding') return width >= 1.2 ? { item: 'door-folding', height: 2.2, sill: 0 } : { item: 'door-bifold', height: 2.1, sill: 0 };
  if (kind === 'passage') return { item: 'door-cased-opening', height: 2.1, sill: 0 };
  if (width >= 2.4) return { item: 'window-sliding', height: 2.1, sill: 0.1 };
  if (width <= 0.8) return { item: 'window-casement', height: 0.6, sill: 1.4 };
  return { item: 'window-casement', height: 1.4, sill: 0.9 };
}

/** An arc as short lines (reference lines of arcs that are not doors). */
export function arcLines(arc, step = 10 * DEG) {
  const a0 = Math.atan2(arc.p0[1] - arc.c[1], arc.p0[0] - arc.c[0]);
  const a1 = Math.atan2(arc.p1[1] - arc.c[1], arc.p1[0] - arc.c[0]);
  let sweep = a1 - a0;
  // Plan axes are mirrored (z = −y): the arc runs clockwise from p0 to p1 here, i.e. a negative sweep.
  const want = -Math.abs(arc.sweep);
  while (sweep > 0) sweep -= Math.PI * 2;
  if (Math.abs(sweep - want) > Math.abs(sweep + Math.PI * 2 - want)) sweep += Math.PI * 2;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / step));
  const pts = Array.from({ length: n + 1 }, (_, i) => [arc.c[0] + arc.r * Math.cos(a0 + (sweep * i) / n), arc.c[1] + arc.r * Math.sin(a0 + (sweep * i) / n)]);
  return pts.slice(1).map((p, i) => [pts[i], p]);
}
