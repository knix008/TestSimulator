// Offset Entities with the reference's options: a chain of lines and arcs offset to one side as a connected
// chain (each piece offset to the same side of the way the chain runs; consecutive pieces trimmed or extended to
// meet, or joined by a round where they open apart), both directions at once, the ends of an open chain capped
// with arcs or lines, the whole chain taken from one picked curve, and the base geometry or the offset made
// construction geometry. Circles and ellipses offset on their own (positive = outward).
import { addArc, addConstraint, addLine, arcGeometry, byId, newSketchId, ORIGIN } from './sketch.js';
import { addEllipse } from './sketchtools.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (d) => Math.hypot(d[0], d[1]);
const unit = (d) => { const l = len(d) || 1; return [d[0] / l, d[1] / l]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const left = (d) => [-d[1], d[0]];
const TOL = 1e-7;

const XY = (sketch, id) => { const p = byId(sketch, id); return [p.x, p.y]; };
const CHAINABLE = new Set(['line', 'arc']);

/** The curves joined to `ids` through shared end points (the whole chain), keeping the picked ones first. */
export function chainOf(sketch, ids) {
  const curves = sketch.entities.filter((e) => CHAINABLE.has(e.type) && !e.construction);
  const byPoint = new Map();
  for (const e of curves) for (const p of [e.p1, e.p2]) { if (!byPoint.has(p)) byPoint.set(p, []); byPoint.get(p).push(e); }
  const out = new Set(ids);
  const queue = ids.map((id) => byId(sketch, id)).filter((e) => e && CHAINABLE.has(e.type));
  while (queue.length) {
    const e = queue.pop();
    for (const p of [e.p1, e.p2]) for (const n of byPoint.get(p) ?? []) if (!out.has(n.id)) { out.add(n.id); queue.push(n); }
  }
  return [...out];
}

/**
 * Lines and arcs in runs: [{ items: [{ e, fwd }], closed }] — each run ordered end to end, `fwd` when the curve
 * runs p1 → p2 along it. A run starts at the first picked curve, in its own direction when it is open at both
 * sides of that curve's start; a closed run goes counterclockwise.
 */
export function chainRuns(sketch, curves) {
  const left0 = new Set(curves.map((e) => e.id));
  const byPoint = new Map();
  for (const e of curves) for (const p of [e.p1, e.p2]) { if (!byPoint.has(p)) byPoint.set(p, []); byPoint.get(p).push(e); }
  const runs = [];
  for (const seed of curves) {
    if (!left0.has(seed.id)) continue;
    // Walk back from the seed's start to the run's start (or round to the seed: closed).
    let start = seed; let fwd = true; let guard = 0;
    for (;;) {
      const at = fwd ? start.p1 : start.p2;
      const nb = (byPoint.get(at) ?? []).filter((x) => x !== start && left0.has(x.id));
      if (nb.length !== 1 || (byPoint.get(at) ?? []).length > 2 || ++guard > curves.length) break;
      const prev = nb[0];
      if (prev === seed) break;
      fwd = prev.p2 === at;
      start = prev;
    }
    const items = []; let cur = start; let f = fwd; let closed = false;
    for (;;) {
      items.push({ e: cur, fwd: f }); left0.delete(cur.id);
      const at = f ? cur.p2 : cur.p1;
      const all = byPoint.get(at) ?? [];
      if (all.length !== 2) break;
      const next = all.find((x) => x !== cur);
      if (!next || next === items[0].e) { closed = Boolean(next) && (items[0].fwd ? items[0].e.p1 : items[0].e.p2) === at; break; }
      if (!left0.has(next.id)) break;
      f = next.p1 === at; cur = next;
    }
    runs.push({ items, closed });
  }
  // A closed run goes counterclockwise.
  for (const r of runs) {
    if (!r.closed) continue;
    let area = 0;
    for (const it of r.items) {
      const pts = sampleCurve(sketch, it.e, it.fwd);
      for (let i = 0; i + 1 < pts.length; i++) area += cross(pts[i], pts[i + 1]);
    }
    if (area < 0) r.items = r.items.reverse().map((it) => ({ e: it.e, fwd: !it.fwd }));
  }
  return runs;
}

function sampleCurve(sketch, e, fwd) {
  let pts;
  if (e.type === 'line') pts = [XY(sketch, e.p1), XY(sketch, e.p2)];
  else { const g = arcGeometry(sketch, e); pts = Array.from({ length: 9 }, (_, i) => { const a = g.a0 + ((g.a1 - g.a0) * i) / 8; return [g.cx + g.r * Math.cos(a), g.cy + g.r * Math.sin(a)]; }); }
  return fwd ? pts : pts.reverse();
}

/** One piece's offset: { kind, start, end, (line) dir | (arc) c, r, fwd } — d to the left of the way it runs. */
function offsetPiece(sketch, { e, fwd }, d) {
  if (e.type === 'line') {
    const a = XY(sketch, fwd ? e.p1 : e.p2); const b = XY(sketch, fwd ? e.p2 : e.p1);
    const dir = unit(sub(b, a)); const n = mul(left(dir), d);
    return { kind: 'line', src: e, start: add(a, n), end: add(b, n), dir };
  }
  const g = arcGeometry(sketch, e);
  const c = [g.cx, g.cy];
  // Counterclockwise (p1 → p2) the left side is the centre.
  const r = g.r + (fwd ? -d : d);
  if (!(r > TOL)) return null;
  const at = (a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  return { kind: 'arc', src: e, c, r, fwd, start: at(fwd ? g.a0 : g.a1), end: at(fwd ? g.a1 : g.a0) };
}

function lineCircle(p, dir, c, r) {
  const f = sub(p, c); const b = dot(f, dir); const q = dot(f, f) - r * r; const disc = b * b - q;
  if (disc < -TOL) return [];
  const s = Math.sqrt(Math.max(0, disc));
  return [add(p, mul(dir, -b - s)), add(p, mul(dir, -b + s))];
}
function circleCircle(c1, r1, c2, r2) {
  const d = len(sub(c2, c1));
  if (d < TOL || d > r1 + r2 + TOL || d < Math.abs(r1 - r2) - TOL) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d); const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = unit(sub(c2, c1)); const m = add(c1, mul(u, a));
  return [add(m, mul(left(u), h)), add(m, mul(left(u), -h))];
}
/** Where two offset pieces meet near `near` (their curves extended), or null. */
function meet(a, b, near) {
  let cands = [];
  if (a.kind === 'line' && b.kind === 'line') {
    const den = cross(a.dir, b.dir);
    if (Math.abs(den) > 1e-12) { const t = cross(sub(b.start, a.start), b.dir) / den; cands = [add(a.start, mul(a.dir, t))]; }
  } else if (a.kind === 'line') cands = lineCircle(a.start, a.dir, b.c, b.r);
  else if (b.kind === 'line') cands = lineCircle(b.start, b.dir, a.c, a.r);
  else cands = circleCircle(a.c, a.r, b.c, b.r);
  if (!cands.length) return null;
  return cands.reduce((m, p) => (len(sub(p, near)) < len(sub(m, near)) ? p : m));
}

/**
 * Offsets lines and arcs as chains, and circles / ellipses on their own. Options:
 *   distance (> 0), reverse (the other side), both (both sides), cap: 'none' | 'arcs' | 'lines' (ends of open
 *   chains when both sides are made), chain (take the whole chain of each picked curve), baseConstruction (the
 *   picked geometry becomes construction), construction (the offset is construction geometry).
 * Returns { made: [entities], failed: count of pieces that vanished (radius ≤ 0) }.
 */
export function offsetChain(sketch, ids, { distance = 2, reverse = false, both = false, cap = 'none', chain = false, baseConstruction = false, construction = false } = {}) {
  const pick = (chain ? chainOf(sketch, ids) : ids).map((id) => byId(sketch, id)).filter((e) => e && e.id !== ORIGIN);
  const curves = pick.filter((e) => CHAINABLE.has(e.type));
  const loose = pick.filter((e) => e.type === 'circle' || e.type === 'ellipse');
  const d0 = Math.abs(Number(distance)) * (reverse ? -1 : 1);
  if (!(Math.abs(d0) > TOL)) return { made: [], failed: 0 };
  const made = []; let failed = 0;
  const opts = construction ? { construction: true } : {};
  const pt = (p) => { const q = { id: newSketchId('p'), type: 'point', x: p[0], y: p[1] }; sketch.entities.push(q); return q; };
  const sides = both ? [d0, -d0] : [d0];

  // Circles and ellipses: positive outward.
  for (const e of loose) for (const d of sides) {
    const c = byId(sketch, e.c);
    if (e.type === 'circle') {
      const r = e.r + d; if (!(r > TOL)) { failed++; continue; }
      const n = { id: newSketchId('c'), type: 'circle', c: pt([c.x, c.y]).id, r, ...opts }; sketch.entities.push(n);
      addConstraint(sketch, { type: 'concentric', a: e.id, b: n.id }); made.push(n);
    } else {
      if (!(e.rx + d > TOL && e.ry + d > TOL)) { failed++; continue; }
      made.push(addEllipse(sketch, c.x, c.y, e.rx + d, e.ry + d, e.rot, opts));
    }
  }

  for (const run of chainRuns(sketch, curves)) {
    const ends = []; // per side: the first and last offset points (open runs)
    for (const d of sides) {
      // A closed run goes counterclockwise; positive distances go outward (to its right).
      const pieces = run.items.map((it) => offsetPiece(sketch, it, run.closed ? -d : d));
      const live = pieces.map((p, i) => ({ p, it: run.items[i] })).filter((x) => x.p);
      failed += pieces.length - live.length;
      if (!live.length) continue;
      const n = live.length;
      // Junctions: the original shared point between consecutive pieces.
      const joins = []; // joins[i]: between live[i] and live[i+1]
      for (let i = 0; i < n - (run.closed ? 0 : 1); i++) {
        const A = live[i]; const B = live[(i + 1) % n];
        const orig = XY(sketch, A.it.fwd ? A.it.e.p2 : A.it.e.p1);
        if (len(sub(A.p.end, B.p.start)) < 1e-6) { joins.push({ at: A.p.end }); continue; }
        // On the outside of the turn the pieces open apart: two lines are extended to a sharp corner, anything
        // with an arc (or a turn right back) gets a round about the corner. On the inside they are trimmed.
        const tA = pieceTangent(A.p, 'end'); const tB = pieceTangent(B.p, 'start');
        const dEff = run.closed ? -d : d;
        const outside = cross(tA, tB) * dEff < 0;
        const cusp = dot(tA, tB) < -0.999;
        const x = cusp || (outside && (A.p.kind === 'arc' || B.p.kind === 'arc')) ? null : meet(A.p, B.p, orig);
        if (x && onExtension(A.p, x, 'end') && onExtension(B.p, x, 'start')) joins.push({ at: x });
        else joins.push({ round: orig, from: A.p.end, to: B.p.start });
      }
      // Points: the start of every piece and the end (shared through the joins).
      const startPt = new Array(n); const endPt = new Array(n);
      startPt[0] = pt(live[0].p.start);
      for (let i = 0; i < joins.length; i++) {
        const j = joins[i]; const ni = (i + 1) % n;
        if (j.at) { const q = i + 1 === n ? startPt[0] : pt(j.at); if (i + 1 === n) { startPt[0].x = j.at[0]; startPt[0].y = j.at[1]; } endPt[i] = q; startPt[ni] = q; }
        else { endPt[i] = pt(j.from); startPt[ni] = i + 1 === n ? startPt[0] : pt(j.to); if (i + 1 === n) { startPt[0].x = j.to[0]; startPt[0].y = j.to[1]; } }
      }
      if (!run.closed) endPt[n - 1] = pt(live[n - 1].p.end);
      // The pieces.
      for (let i = 0; i < n; i++) {
        const { p, it } = live[i]; const s = startPt[i]; const e = endPt[i];
        if (p.kind === 'line') {
          const l = addLine(sketch, 0, 0, 0, 0, { from: s.id, to: e.id, ...opts });
          addConstraint(sketch, { type: 'parallel', a: it.e.id, b: l.id }); made.push(l);
        } else {
          const ang = (q) => Math.atan2(q.y - p.c[1], q.x - p.c[0]);
          const [from, to] = p.fwd ? [s, e] : [e, s];
          const a = addArc(sketch, p.c[0], p.c[1], p.r, ang(from), ang(to), { from: from.id, to: to.id, ...opts });
          addConstraint(sketch, { type: 'concentric', a: it.e.id, b: a.id }); made.push(a);
        }
      }
      // Rounds where pieces opened apart (counterclockwise about the corner on the outer side).
      joins.forEach((j, i) => {
        if (!j.round) return;
        const s = endPt[i]; const e = startPt[(i + 1) % n];
        const r = len(sub([s.x, s.y], j.round));
        const turnLeft = cross(sub([s.x, s.y], j.round), sub([e.x, e.y], j.round)) > 0;
        const ang = (q) => Math.atan2(q.y - j.round[1], q.x - j.round[0]);
        const [from, to] = turnLeft ? [s, e] : [e, s];
        made.push(addArc(sketch, j.round[0], j.round[1], r, ang(from), ang(to), { from: from.id, to: to.id, ...opts }));
      });
      if (!run.closed) ends.push({ first: startPt[0], last: endPt[n - 1], d });
    }
    // Caps on open runs when both sides were made.
    if (both && !run.closed && ends.length === 2 && cap !== 'none') {
      const first = run.items[0]; const last = run.items[run.items.length - 1];
      const capAt = (orig, pa, pb, outward) => {
        if (cap === 'lines') { made.push(addLine(sketch, 0, 0, 0, 0, { from: pa.id, to: pb.id, ...opts })); return; }
        const r = len(sub([pa.x, pa.y], orig));
        const ang = (q) => Math.atan2(q.y - orig[1], q.x - orig[0]);
        // The half circle that bulges away from the chain.
        const a0 = ang(pa); let a1 = ang(pb); while (a1 <= a0) a1 += 2 * Math.PI;
        const mid = (a0 + a1) / 2;
        const ccwOut = dot([Math.cos(mid), Math.sin(mid)], outward) > 0;
        const [from, to] = ccwOut ? [pa, pb] : [pb, pa];
        made.push(addArc(sketch, orig[0], orig[1], r, ang(from), ang(to), { from: from.id, to: to.id, ...opts }));
      };
      const s0 = XY(sketch, first.fwd ? first.e.p1 : first.e.p2);
      const e0 = XY(sketch, last.fwd ? last.e.p2 : last.e.p1);
      const tStart = tangentAt(sketch, first, 'start'); const tEnd = tangentAt(sketch, last, 'end');
      capAt(s0, ends[0].first, ends[1].first, mul(tStart, -1));
      capAt(e0, ends[0].last, ends[1].last, tEnd);
    }
  }
  if (baseConstruction) for (const e of pick) e.construction = true;
  return { made, failed };
}

/** The way an offset piece runs at its start or end (unit). */
function pieceTangent(p, which) {
  if (p.kind === 'line') return p.dir;
  const q = which === 'start' ? p.start : p.end;
  const t = left(unit(sub(q, p.c)));
  return p.fwd ? t : mul(t, -1);
}

/** Whether x lies on the piece or beyond the given end (so trimming / extending there keeps the piece's way). */
function onExtension(p, x, which) {
  if (p.kind === 'line') {
    const t = dot(sub(x, p.start), p.dir); const L = dot(sub(p.end, p.start), p.dir);
    return which === 'end' ? t > 1e-9 : t < L - 1e-9;
  }
  return true;
}

/** The way a run's piece goes at its start or end (unit). */
function tangentAt(sketch, it, which) {
  const { e, fwd } = it;
  if (e.type === 'line') return unit(sub(XY(sketch, fwd ? e.p2 : e.p1), XY(sketch, fwd ? e.p1 : e.p2)));
  const g = arcGeometry(sketch, e);
  const a = (which === 'start') === fwd ? g.a0 : g.a1;
  const t = [-Math.sin(a), Math.cos(a)]; // counterclockwise
  return fwd ? t : mul(t, -1);
}
